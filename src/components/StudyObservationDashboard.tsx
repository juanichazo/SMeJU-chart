// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Badge, Chip, Group, Loader, Stack } from '@mantine/core';
import type { MedplumClient } from '@medplum/core';
import type { CodeableConcept, Observation, Patient } from '@medplum/fhirtypes';
import { ObservationTable, useMedplum } from '@medplum/react';
import { IconActivity, IconClipboardData, IconFileAnalytics } from '@tabler/icons-react';
import type { ChartData } from 'chart.js';
import { useEffect, useMemo, useState } from 'react';
import type { JSX } from 'react';
import { LineChart } from './graphs/LineChart';
import { localQuestionnairesByUrl } from './trackedQuestionnaires';
import { MEDPLUM_PROJECT_ID } from '../config';
import classes from './StudyDashboard.module.css';

interface StudyObservationDashboardProps {
  patient: Patient;
}

interface ProjectMeta {
  project?: string;
}

function belongsToProject(resource: { meta?: ProjectMeta }): boolean {
  return resource.meta?.project === MEDPLUM_PROJECT_ID;
}

// Matching by LOINC code turned out to be unreliable: confirmed against real submitted data that some
// questionnaires (AUDIT, HITS) record Observations with NO code at all (only a free-text code.text), so
// no code list could ever match them. Every sampled Observation DOES carry a correct `derivedFrom` link to
// the QuestionnaireResponse it came from, which is a much more reliable signal — so questionnaire identity
// is now resolved via derivedFrom -> QuestionnaireResponse.questionnaire (a canonical URL) instead.
//
// The local Questionnaires/*.json files are kept only as a fast, no-network-call lookup for the
// questionnaires we already know about (matched by their own `url` field). Anything else the patient
// answered is still shown — its title is resolved with one live Questionnaire lookup — since all
// questionnaire results for this project's patients are wanted, not just the locally known ones.
//
// data/core/encounter-note-questionnaires.json confirms the 3 encounter-note questionnaires
// (encounter-note, obstetric-visit, gynecology-visit) are a separate, unrelated set: those bots
// (src/bots/core/*-encounter-note.ts) also stamp `derivedFrom` on their vitals Observations, which already
// have their own "Observations" tab — they must not show up here as fake "score" cards.
const ENCOUNTER_NOTE_QUESTIONNAIRE_NAMES = new Set(['encounter-note', 'obstetric-visit', 'gynecology-visit']);

interface QuestionnaireIdentity {
  id: string;
  title: string;
}

// Cached across patients — the set of questionnaires in a deployment is small and stable, so this avoids
// re-resolving the same QuestionnaireResponse/Questionnaire lookups every time a new patient is viewed.
const identityCache = new Map<string, QuestionnaireIdentity | undefined>();
const responseIdentityCache = new Map<string, QuestionnaireIdentity | undefined>();

async function resolveQuestionnaireIdentity(
  medplum: MedplumClient,
  questionnaireCanonicalUrl: string | undefined
): Promise<QuestionnaireIdentity | undefined> {
  if (!questionnaireCanonicalUrl) {
    return undefined;
  }
  const url = questionnaireCanonicalUrl.split('|')[0];
  if (identityCache.has(url)) {
    return identityCache.get(url);
  }

  const local = localQuestionnairesByUrl.get(url);
  if (local) {
    const identity = ENCOUNTER_NOTE_QUESTIONNAIRE_NAMES.has(local.name ?? '') ? undefined : { id: url, title: local.title };
    identityCache.set(url, identity);
    return identity;
  }

  try {
    const resource = await medplum.searchOne('Questionnaire', { url });
    const identity =
      resource && !ENCOUNTER_NOTE_QUESTIONNAIRE_NAMES.has(resource.name ?? '')
        ? { id: url, title: resource.title ?? resource.name ?? 'Questionnaire' }
        : undefined;
    identityCache.set(url, identity);
    return identity;
  } catch (err) {
    console.warn('Could not resolve Questionnaire for', url, err);
    identityCache.set(url, undefined);
    return undefined;
  }
}

async function resolveResponseIdentity(medplum: MedplumClient, responseId: string): Promise<QuestionnaireIdentity | undefined> {
  if (responseIdentityCache.has(responseId)) {
    return responseIdentityCache.get(responseId);
  }
  try {
    const response = await medplum.readResource('QuestionnaireResponse', responseId);
    const identity = await resolveQuestionnaireIdentity(medplum, response.questionnaire);
    responseIdentityCache.set(responseId, identity);
    return identity;
  } catch (err) {
    console.warn('Could not resolve QuestionnaireResponse', responseId, err);
    responseIdentityCache.set(responseId, undefined);
    return undefined;
  }
}

interface QuestionnaireGroup {
  id: string;
  title: string;
  observations: Observation[];
}

function getDerivedFromResponseId(observation: Observation): string | undefined {
  const ref = observation.derivedFrom?.[0]?.reference;
  return ref?.startsWith('QuestionnaireResponse/') ? ref.slice('QuestionnaireResponse/'.length) : undefined;
}

async function groupObservationsByQuestionnaire(
  medplum: MedplumClient,
  observations: Observation[]
): Promise<Map<string, QuestionnaireGroup>> {
  const responseIds = new Set<string>();
  for (const observation of observations) {
    const responseId = getDerivedFromResponseId(observation);
    if (responseId) {
      responseIds.add(responseId);
    }
  }

  const identityByResponseId = new Map<string, QuestionnaireIdentity | undefined>();
  await Promise.all(
    Array.from(responseIds).map(async (responseId) => {
      identityByResponseId.set(responseId, await resolveResponseIdentity(medplum, responseId));
    })
  );

  const groups = new Map<string, QuestionnaireGroup>();
  for (const observation of observations) {
    const responseId = getDerivedFromResponseId(observation);
    const identity = responseId ? identityByResponseId.get(responseId) : undefined;
    if (!identity) {
      continue;
    }
    const group = groups.get(identity.id) ?? { id: identity.id, title: identity.title, observations: [] };
    group.observations.push(observation);
    groups.set(identity.id, group);
  }
  return groups;
}

export function StudyObservationDashboard(props: StudyObservationDashboardProps): JSX.Element {
  const medplum = useMedplum();
  const [observations, setObservations] = useState<Observation[]>([]);
  const [groups, setGroups] = useState<Map<string, QuestionnaireGroup>>(new Map());
  const [loading, setLoading] = useState(true);
  const [selectedQuestionnaire, setSelectedQuestionnaire] = useState('all');

  useEffect(() => {
    let alive = true;

    async function load(): Promise<void> {
      if (!props.patient.id) {
        return;
      }
      setLoading(true);
      try {
        const raw = await medplum.searchResources('Observation', {
          patient: `Patient/${props.patient.id}`,
          _count: 500,
          _sort: '-date',
        });
        const filtered = raw.filter(belongsToProject);
        const resolvedGroups = await groupObservationsByQuestionnaire(medplum, filtered);
        if (!alive) {
          return;
        }
        setObservations(filtered);
        setGroups(resolvedGroups);
      } catch (err) {
        console.error(err);
        if (alive) {
          setObservations([]);
          setGroups(new Map());
        }
      } finally {
        if (alive) {
          setLoading(false);
        }
      }
    }

    load().catch(console.error);

    return () => {
      alive = false;
    };
  }, [medplum, props.patient.id]);

  const scoreObservations = useMemo(() => getScoreObservations(observations), [observations]);
  const questionnaireCards = useMemo(() => Array.from(groups.values()).filter((g) => g.observations.length > 0), [groups]);
  const visibleObservations = useMemo(() => {
    if (selectedQuestionnaire === 'all') {
      return observations;
    }
    return groups.get(selectedQuestionnaire)?.observations ?? [];
  }, [groups, observations, selectedQuestionnaire]);

  if (loading) {
    return (
      <div className={classes.empty}>
        <Loader />
      </div>
    );
  }

  return (
    <Stack gap="md">
      <div className={classes.statGrid}>
        <Metric label="Total observations" value={observations.length} />
        <Metric label="Questionnaire groups" value={questionnaireCards.length} />
        <Metric label="Score results" value={scoreObservations.length} />
        <Metric label="Recent records" value={visibleObservations.slice(0, 12).length} />
      </div>

      <section className={classes.panel}>
        <div className={classes.toolbar}>
          <div>
            <div className={classes.title}>Questionnaire scores</div>
            <div className={classes.muted}>Latest submission per questionnaire, with score evolution over time.</div>
          </div>
          <Badge leftSection={<IconActivity size={14} />} color="teal" variant="light">
            {getPatientName(props.patient)}
          </Badge>
        </div>
        {questionnaireCards.length === 0 ? (
          <div className={classes.empty}>No questionnaire score observations found yet.</div>
        ) : (
          <div className={classes.scoreGrid}>
            {questionnaireCards.map((group) => (
              <QuestionnaireScoreCard title={group.title} observations={group.observations} key={group.id} />
            ))}
          </div>
        )}
      </section>

      <section className={classes.questionnaireGrid}>
        <div className={classes.panel}>
          <div className={classes.toolbar}>
            <div>
              <div className={classes.title}>Questionnaires</div>
              <div className={classes.muted}>Every questionnaire this patient has submitted, resolved via derivedFrom.</div>
            </div>
            <IconClipboardData size={22} />
          </div>
          {/*
            A SegmentedControl doesn't wrap — with many questionnaires it silently squeezed some options
            out of reach. Chips wrap onto multiple lines instead, so every filter stays reachable.
          */}
          <Chip.Group value={selectedQuestionnaire} onChange={(value) => setSelectedQuestionnaire(value as string)}>
            <Group gap={8} wrap="wrap">
              <Chip value="all" variant="light">
                All
              </Chip>
              {questionnaireCards.map((g) => (
                <Chip value={g.id} variant="light" key={g.id}>
                  {shortTitle(g.title)}
                </Chip>
              ))}
            </Group>
          </Chip.Group>
          <div className={classes.questionnaireList} style={{ marginTop: 12 }}>
            {questionnaireCards.map((group) => (
              <Group justify="space-between" key={group.id}>
                <div>
                  <div className={classes.metric}>{group.title}</div>
                  <div className={classes.muted}>{group.observations.length} matched observations</div>
                </div>
                <Badge variant="light" color="teal">
                  {group.observations.length}
                </Badge>
              </Group>
            ))}
          </div>
        </div>

        <div className={classes.panel}>
          <div className={classes.toolbar}>
            <div>
              <div className={classes.title}>Observation detail</div>
              <div className={classes.muted}>Clean view of values, codes, and dates for practitioner review.</div>
            </div>
            <IconFileAnalytics size={22} />
          </div>
          {visibleObservations.length === 0 ? (
            <div className={classes.empty}>No observations in this selection.</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <ObservationTable value={visibleObservations.slice(0, 40)} />
            </div>
          )}
        </div>
      </section>
    </Stack>
  );
}

function Metric(props: { label: string; value: number }): JSX.Element {
  return (
    <div className={classes.statCard}>
      <div className={classes.statLabel}>{props.label}</div>
      <div className={classes.statValue}>{props.value}</div>
    </div>
  );
}

function QuestionnaireScoreCard(props: { title: string; observations: Observation[] }): JSX.Element {
  const latest = props.observations[0];
  const isMultiComponent = Boolean(latest.component?.length);
  const interpretation = latest.interpretation?.[0];
  const interpretationText = interpretation ? getConceptText(interpretation) : undefined;
  const chartData = useMemo(
    () => (isMultiComponent ? buildMultiSeriesChartData(props.observations) : buildTrendChartData(props.title, props.observations)),
    [isMultiComponent, props.title, props.observations]
  );

  return (
    <div className={isMultiComponent ? `${classes.scoreCard} ${classes.scoreCardWide}` : classes.scoreCard}>
      <div className={classes.scoreHeader}>
        <div className={classes.metric}>{props.title}</div>
        <div className={classes.muted}>{formatDate(latest.effectiveDateTime ?? latest.issued)}</div>
      </div>
      {interpretationText && <div className={classes.interpretation}>{interpretationText}</div>}
      {isMultiComponent ? (
        <div className={classes.componentValues}>
          {(latest.component ?? []).map((component) => (
            <div className={classes.componentValue} key={getConceptText(component.code)}>
              <span className={classes.componentLabel}>{getConceptText(component.code)}</span>
              <span className={classes.componentNumber}>
                {component.valueQuantity?.value ?? component.valueInteger ?? component.valueString ?? '—'}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <div className={classes.scoreValue}>{getObservationNumber(latest) ?? getObservationValue(latest)}</div>
      )}
      <LineChart chartData={chartData} showLegend={isMultiComponent} height={isMultiComponent ? 220 : 160} />
    </div>
  );
}

// A line chart with a single point renders as a dot, not a line. Duplicating that lone point gives it two
// x positions to connect, so a single submission still reads as a flat trend line instead of just a dot.
function padSinglePoint<T>(labels: string[], series: T[][]): { labels: string[]; series: T[][] } {
  if (labels.length !== 1) {
    return { labels, series };
  }
  return { labels: [labels[0], labels[0]], series: series.map((values) => [values[0], values[0]]) };
}

function buildTrendChartData(label: string, observations: Observation[]): ChartData<'line', number[], string> {
  // Search results are sorted newest-first; the trend graph reads left-to-right, oldest-first.
  const history = [...observations].reverse();
  const rawLabels = history.map((observation) => formatDate(observation.effectiveDateTime ?? observation.issued));
  const rawData = history.map((observation) => getObservationNumber(observation) ?? 0);
  const { labels, series } = padSinglePoint(rawLabels, [rawData]);
  return {
    labels,
    datasets: [
      {
        label,
        data: series[0],
        backgroundColor: 'rgba(29, 112, 214, 0.7)',
        borderColor: 'rgba(29, 112, 214, 1)',
      },
    ],
  };
}

// For questionnaires like CTQ-SF that record several subscale scores as Observation.component[] instead of
// a single top-level value — one overlapping trend line per subscale, detected structurally (has
// components) rather than by matching a specific questionnaire name, so it also covers any other
// multi-component questionnaire without extra code.
const MULTI_SERIES_COLORS: { backgroundColor: string; borderColor: string }[] = [
  { backgroundColor: 'rgba(29, 112, 214, 0.7)', borderColor: 'rgba(29, 112, 214, 1)' },
  { backgroundColor: 'rgba(255, 119, 0, 0.7)', borderColor: 'rgba(255, 119, 0, 1)' },
  { backgroundColor: 'rgba(47, 125, 74, 0.7)', borderColor: 'rgba(47, 125, 74, 1)' },
  { backgroundColor: 'rgba(214, 29, 92, 0.7)', borderColor: 'rgba(214, 29, 92, 1)' },
  { backgroundColor: 'rgba(124, 58, 237, 0.7)', borderColor: 'rgba(124, 58, 237, 1)' },
  { backgroundColor: 'rgba(47, 125, 140, 0.7)', borderColor: 'rgba(47, 125, 140, 1)' },
];

function getComponentSeriesLabels(observations: Observation[]): string[] {
  const labels = new Set<string>();
  for (const observation of observations) {
    for (const component of observation.component ?? []) {
      labels.add(getConceptText(component.code));
    }
  }
  return Array.from(labels);
}

function getComponentNumber(observation: Observation, label: string): number | undefined {
  const component = observation.component?.find((c) => getConceptText(c.code) === label);
  return component?.valueQuantity?.value ?? component?.valueInteger;
}

function buildMultiSeriesChartData(observations: Observation[]): ChartData<'line', number[], string> {
  const history = [...observations].reverse();
  const seriesLabels = getComponentSeriesLabels(observations);
  const rawLabels = history.map((observation) => formatDate(observation.effectiveDateTime ?? observation.issued));
  const rawSeries = seriesLabels.map((label) => history.map((observation) => getComponentNumber(observation, label) ?? 0));
  const { labels, series } = padSinglePoint(rawLabels, rawSeries);
  return {
    labels,
    datasets: seriesLabels.map((label, index) => ({
      label,
      data: series[index],
      ...MULTI_SERIES_COLORS[index % MULTI_SERIES_COLORS.length],
    })),
  };
}

function getScoreObservations(observations: Observation[]): Observation[] {
  return observations
    .filter((observation) => getObservationNumber(observation) !== undefined || (observation.component?.length ?? 0) > 0)
    .sort((a, b) => getDateMs(b) - getDateMs(a));
}

function getConceptText(concept: CodeableConcept | undefined): string {
  return concept?.text ?? concept?.coding?.find((coding) => coding.display)?.display ?? concept?.coding?.[0]?.code ?? 'Observation';
}

function getObservationValue(observation: Observation): string {
  if (observation.valueQuantity) {
    return `${observation.valueQuantity.value ?? ''} ${observation.valueQuantity.unit ?? observation.valueQuantity.code ?? ''}`.trim();
  }
  if (observation.valueInteger !== undefined) {
    return String(observation.valueInteger);
  }
  if (observation.valueString) {
    return observation.valueString;
  }
  if (observation.valueBoolean !== undefined) {
    return observation.valueBoolean ? 'Yes' : 'No';
  }
  if (observation.valueCodeableConcept) {
    return getConceptText(observation.valueCodeableConcept);
  }
  if (observation.component?.length) {
    return observation.component
      .map((component) => `${getConceptText(component.code)}: ${component.valueQuantity?.value ?? component.valueString ?? ''}`)
      .join(', ');
  }
  return 'No value';
}

function getObservationNumber(observation: Observation): number | undefined {
  return observation.valueQuantity?.value ?? observation.valueInteger;
}

function getDateMs(observation: Observation): number {
  return new Date(observation.effectiveDateTime ?? observation.issued ?? 0).getTime();
}

function getPatientName(patient: Patient): string {
  const name = patient.name?.[0];
  const parts = [...(name?.given ?? []), name?.family].filter(Boolean);
  return parts.length > 0 ? parts.join(' ') : 'Unnamed patient';
}

function formatDate(value: string | undefined): string {
  if (!value) {
    return 'No date';
  }
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(value));
}

function shortTitle(title: string): string {
  return title
    .replace('Alcohol Use Disorders Identification Test ', '')
    .replace('Childhood Trauma Questionnaire - Short Form ', '')
    .replace('Generalized Anxiety Disorder ', '')
    .replace('Cuestionario de datos sociodemográficos', 'Sociodemographics')
    .replace('Screening de Determinantes Sociales de la Salud (SDOH)', 'SDOH');
}
