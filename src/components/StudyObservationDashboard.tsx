// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Badge, Group, Loader, SegmentedControl, Stack } from '@mantine/core';
import type { CodeableConcept, Coding, Observation, Patient, Questionnaire, QuestionnaireItem } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react';
import { IconActivity, IconClipboardData, IconFileAnalytics } from '@tabler/icons-react';
import { useEffect, useMemo, useState } from 'react';
import type { JSX } from 'react';
import audit from '../../Questionnaires/AUDIT.json';
import ctq from '../../Questionnaires/CTQ-SF.json';
import demographics from '../../Questionnaires/DatosSociodemograficosEstudiantes.json';
import gad from '../../Questionnaires/GAD-7.json';
import hits from '../../Questionnaires/HITS.json';
import mos from '../../Questionnaires/MOS-SSS.json';
import phq from '../../Questionnaires/PHQ-9.json';
import { MEDPLUM_PROJECT_ID } from '../config';
import classes from './StudyDashboard.module.css';

interface StudyObservationDashboardProps {
  patient: Patient;
}

interface QuestionnaireDefinition {
  id: string;
  title: string;
  codes: Set<string>;
  maxScore?: number;
}

interface ProjectMeta {
  project?: string;
  compartment?: { reference?: string }[];
}

const questionnaires = [audit, ctq, demographics, gad, hits, mos, phq].map((q) =>
  buildQuestionnaireDefinition(q as Questionnaire)
);

const scoreDefinitions: Record<string, { max: number; label: string; ranges: { max: number; label: string; color: string }[] }> = {
  '44261-6': {
    max: 27,
    label: 'PHQ-9',
    ranges: [
      { max: 4, label: 'Minimal', color: 'green' },
      { max: 9, label: 'Mild', color: 'yellow' },
      { max: 14, label: 'Moderate', color: 'orange' },
      { max: 19, label: 'Moderately severe', color: 'red' },
      { max: 27, label: 'Severe', color: 'red' },
    ],
  },
  '69737-5': {
    max: 21,
    label: 'GAD-7',
    ranges: [
      { max: 4, label: 'Minimal', color: 'green' },
      { max: 9, label: 'Mild', color: 'yellow' },
      { max: 14, label: 'Moderate', color: 'orange' },
      { max: 21, label: 'Severe', color: 'red' },
    ],
  },
  '58628': {
    max: 21,
    label: 'GAD-7',
    ranges: [
      { max: 4, label: 'Minimal', color: 'green' },
      { max: 9, label: 'Mild', color: 'yellow' },
      { max: 14, label: 'Moderate', color: 'orange' },
      { max: 21, label: 'Severe', color: 'red' },
    ],
  },
};

export function StudyObservationDashboard(props: StudyObservationDashboardProps): JSX.Element {
  const medplum = useMedplum();
  const [observations, setObservations] = useState<Observation[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedQuestionnaire, setSelectedQuestionnaire] = useState('all');

  useEffect(() => {
    let alive = true;

    async function loadObservations(): Promise<void> {
      if (!props.patient.id) {
        return;
      }
      setLoading(true);
      try {
        const result = await searchProjectObservations(props.patient.id);
        if (alive) {
          setObservations(result);
        }
      } catch (err) {
        console.error(err);
        if (alive) {
          setObservations([]);
        }
      } finally {
        if (alive) {
          setLoading(false);
        }
      }
    }

    async function searchProjectObservations(patientId: string): Promise<Observation[]> {
      try {
        return await medplum.searchResources('Observation', {
          patient: `Patient/${patientId}`,
          _count: 500,
          _sort: '-date',
          _project: MEDPLUM_PROJECT_ID,
        } as Record<string, string | number>);
      } catch (err) {
        console.warn('Project search parameter unavailable; falling back to resource metadata filtering.', err);
        const fallback = await medplum.searchResources('Observation', {
          patient: `Patient/${patientId}`,
          _count: 500,
          _sort: '-date',
        } as Record<string, string | number>);
        return filterProjectResources(fallback);
      }
    }

    loadObservations().catch(console.error);

    return () => {
      alive = false;
    };
  }, [medplum, props.patient.id]);

  const groups = useMemo(() => groupObservationsByQuestionnaire(observations), [observations]);
  const scoreObservations = useMemo(() => getScoreObservations(observations), [observations]);
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
        <Metric label="Questionnaire groups" value={Array.from(groups.values()).filter((g) => g.observations.length).length} />
        <Metric label="Score results" value={scoreObservations.length} />
        <Metric label="Recent records" value={visibleObservations.slice(0, 12).length} />
      </div>

      <section className={classes.panel}>
        <div className={classes.toolbar}>
          <div>
            <div className={classes.title}>Questionnaire scores</div>
            <div className={classes.muted}>Latest numeric conclusions detected in Observation resources.</div>
          </div>
          <Badge leftSection={<IconActivity size={14} />} color="teal" variant="light">
            {getPatientName(props.patient)}
          </Badge>
        </div>
        {scoreObservations.length === 0 ? (
          <div className={classes.empty}>No questionnaire score observations found yet.</div>
        ) : (
          <div className={classes.scoreGrid}>
            {scoreObservations.slice(0, 6).map((observation) => (
              <ScoreCard observation={observation} key={observation.id ?? getObservationKey(observation)} />
            ))}
          </div>
        )}
      </section>

      <section className={classes.questionnaireGrid}>
        <div className={classes.panel}>
          <div className={classes.toolbar}>
            <div>
              <div className={classes.title}>Questionnaires</div>
              <div className={classes.muted}>Observation records matched to the local questionnaire folder.</div>
            </div>
            <IconClipboardData size={22} />
          </div>
          <SegmentedControl
            fullWidth
            value={selectedQuestionnaire}
            onChange={setSelectedQuestionnaire}
            data={[
              { label: 'All', value: 'all' },
              ...questionnaires.map((q) => ({ label: shortTitle(q.title), value: q.id })),
            ]}
          />
          <div className={classes.questionnaireList} style={{ marginTop: 12 }}>
            {questionnaires.map((questionnaire) => {
              const count = groups.get(questionnaire.id)?.observations.length ?? 0;
              return (
                <Group justify="space-between" key={questionnaire.id}>
                  <div>
                    <div className={classes.metric}>{questionnaire.title}</div>
                    <div className={classes.muted}>{count} matched observations</div>
                  </div>
                  <Badge variant="light" color={count > 0 ? 'teal' : 'gray'}>
                    {count}
                  </Badge>
                </Group>
              );
            })}
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
            <div className={classes.observationList}>
              {visibleObservations.slice(0, 40).map((observation) => (
                <ObservationRow observation={observation} key={observation.id ?? getObservationKey(observation)} />
              ))}
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

function ScoreCard(props: { observation: Observation }): JSX.Element {
  const value = getObservationNumber(props.observation);
  const code = getObservationCodes(props.observation)[0];
  const definition = code ? scoreDefinitions[code] : undefined;
  const max = definition?.max ?? Math.max(value ?? 0, 1);
  const range = definition?.ranges.find((item) => value !== undefined && value <= item.max);
  const percent = value === undefined ? 0 : Math.max(0, Math.min(100, (value / max) * 100));

  return (
    <div className={classes.scoreCard}>
      <div className={classes.scoreHeader}>
        <div>
          <div className={classes.metric}>{definition?.label ?? getConceptText(props.observation.code)}</div>
          <div className={classes.muted}>{formatDate(props.observation.effectiveDateTime ?? props.observation.issued)}</div>
        </div>
        <Badge color={range?.color ?? 'gray'} variant="light">
          {range?.label ?? props.observation.status}
        </Badge>
      </div>
      <div className={classes.scoreValue}>{value ?? getObservationValue(props.observation)}</div>
      <div className={classes.bar}>
        <div className={classes.barFill} style={{ width: `${percent}%` }} />
      </div>
      <div className={classes.codeText}>{getConceptText(props.observation.code)}</div>
    </div>
  );
}

function ObservationRow(props: { observation: Observation }): JSX.Element {
  const date = props.observation.effectiveDateTime ?? props.observation.issued;
  return (
    <div className={classes.observationRow}>
      <div>
        <div className={classes.metric}>{getConceptText(props.observation.code)}</div>
        <div className={classes.codeText}>{getObservationCodes(props.observation).join(', ') || 'No code'}</div>
      </div>
      <div>
        <div className={classes.muted}>Value</div>
        <div className={classes.metric}>{getObservationValue(props.observation)}</div>
      </div>
      <div>
        <div className={classes.muted}>Date</div>
        <div className={classes.metric}>{formatDate(date)}</div>
      </div>
    </div>
  );
}

function buildQuestionnaireDefinition(questionnaire: Questionnaire): QuestionnaireDefinition {
  const codes = new Set<string>();
  for (const coding of questionnaire.code ?? []) {
    if (coding.code) {
      codes.add(coding.code);
    }
  }
  collectItemCodes(questionnaire.item ?? [], codes);
  return {
    id: questionnaire.id ?? questionnaire.name ?? questionnaire.title ?? crypto.randomUUID(),
    title: questionnaire.title ?? questionnaire.name ?? 'Questionnaire',
    codes,
  };
}

function collectItemCodes(items: QuestionnaireItem[], codes: Set<string>): void {
  for (const item of items) {
    for (const coding of item.code ?? []) {
      if (coding.code) {
        codes.add(coding.code);
      }
    }
    collectItemCodes(item.item ?? [], codes);
  }
}

function groupObservationsByQuestionnaire(
  observations: Observation[]
): Map<string, { questionnaire: QuestionnaireDefinition; observations: Observation[] }> {
  const groups = new Map<string, { questionnaire: QuestionnaireDefinition; observations: Observation[] }>();
  for (const questionnaire of questionnaires) {
    groups.set(questionnaire.id, { questionnaire, observations: [] });
  }
  for (const observation of observations) {
    const codes = getObservationCodes(observation);
    const questionnaire = questionnaires.find((q) => codes.some((code) => q.codes.has(code)));
    if (questionnaire) {
      groups.get(questionnaire.id)?.observations.push(observation);
    }
  }
  return groups;
}

function getScoreObservations(observations: Observation[]): Observation[] {
  return observations
    .filter((observation) => {
      const codes = getObservationCodes(observation);
      return codes.some((code) => scoreDefinitions[code]) || getObservationNumber(observation) !== undefined;
    })
    .sort((a, b) => getDateMs(b) - getDateMs(a));
}

function filterProjectResources<T extends Observation>(resources: T[]): T[] {
  return resources.filter((resource) => {
    const meta = resource.meta as ProjectMeta | undefined;
    const projectReference = `Project/${MEDPLUM_PROJECT_ID}`;
    return meta?.project === MEDPLUM_PROJECT_ID || meta?.compartment?.some((item) => item.reference === projectReference);
  });
}

function getObservationCodes(observation: Observation): string[] {
  return getCodings(observation.code)
    .map((coding) => coding.code)
    .filter((code): code is string => Boolean(code));
}

function getCodings(concept: CodeableConcept | undefined): Coding[] {
  return concept?.coding ?? [];
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
  if (observation.valueDecimal !== undefined) {
    return String(observation.valueDecimal);
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
  return observation.valueQuantity?.value ?? observation.valueInteger ?? observation.valueDecimal;
}

function getDateMs(observation: Observation): number {
  return new Date(observation.effectiveDateTime ?? observation.issued ?? 0).getTime();
}

function getObservationKey(observation: Observation): string {
  return `${getConceptText(observation.code)}-${getDateMs(observation)}-${getObservationValue(observation)}`;
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
    .replace('Cuestionario de datos sociodemográficos', 'Sociodemographics');
}
