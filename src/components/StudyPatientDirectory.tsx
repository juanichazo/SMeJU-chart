// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Badge, Group, Loader, Select, TextInput } from '@mantine/core';
import type { Observation, Patient } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react';
import { IconArrowRight, IconSearch, IconUsers } from '@tabler/icons-react';
import { useEffect, useMemo, useState } from 'react';
import type { JSX } from 'react';
import { Link } from 'react-router';
import { MEDPLUM_PROJECT_ID } from '../config';
import type { DemographicInfo } from './demographics';
import { countAnsweredQuestionnaires, getLatestDemographics } from './demographics';
import classes from './StudyDashboard.module.css';

interface PatientSummaryRow {
  patient: Patient;
  observationCount: number;
  demographics?: DemographicInfo;
  questionnairesAnswered: number;
}

type SortOption = 'latest' | 'name' | 'age' | 'career' | 'university';

const sortOptions: { value: SortOption; label: string }[] = [
  { value: 'latest', label: 'Latest data' },
  { value: 'name', label: 'Name' },
  { value: 'age', label: 'Age' },
  { value: 'career', label: 'Career' },
  { value: 'university', label: 'University' },
];

interface ProjectMeta {
  project?: string;
}

function belongsToProject(resource: { meta?: ProjectMeta }): boolean {
  return resource.meta?.project === MEDPLUM_PROJECT_ID;
}

export function StudyPatientDirectory(): JSX.Element {
  const medplum = useMedplum();
  const [rows, setRows] = useState<PatientSummaryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchText, setSearchText] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('latest');

  useEffect(() => {
    let alive = true;

    async function loadPatients(): Promise<void> {
      setLoading(true);
      try {
        const patients = await searchProjectPatients();
        const summaries = await Promise.all(
          patients.map(async (patient) => {
            const [observations, demographics, questionnairesAnswered] = await Promise.all([
              searchPatientObservations(patient.id as string),
              getLatestDemographics(medplum, patient.id as string),
              countAnsweredQuestionnaires(medplum, patient.id as string),
            ]);
            return {
              patient,
              observationCount: observations.length,
              demographics,
              questionnairesAnswered,
            };
          })
        );
        if (alive) {
          setRows(summaries);
        }
      } catch (err) {
        console.error(err);
        if (alive) {
          setRows([]);
        }
      } finally {
        if (alive) {
          setLoading(false);
        }
      }
    }

    async function searchProjectPatients(): Promise<Patient[]> {
      const patients = await medplum.searchResources('Patient', {
        _count: 100,
        _sort: '-_lastUpdated',
      });
      return patients.filter(belongsToProject);
    }

    async function searchPatientObservations(patientId: string): Promise<Observation[]> {
      const observations = await medplum.searchResources('Observation', {
        patient: `Patient/${patientId}`,
        _count: 200,
        _sort: '-date',
      });
      return observations.filter(belongsToProject);
    }

    loadPatients().catch(console.error);

    return () => {
      alive = false;
    };
  }, [medplum]);

  const filteredRows = useMemo(() => {
    const query = searchText.trim().toLowerCase();
    const matches = !query
      ? rows
      : rows.filter((row) => {
          const haystack = [getPatientName(row.patient), row.demographics?.name, row.demographics?.career, row.demographics?.institution]
            .filter(Boolean)
            .join(' ')
            .toLowerCase();
          return haystack.includes(query);
        });
    return sortRows(matches, sortBy);
  }, [rows, searchText, sortBy]);

  const patientsWithData = rows.filter((row) => row.observationCount > 0).length;
  const totalObservations = rows.reduce((sum, row) => sum + row.observationCount, 0);

  return (
    <div className={classes.shell}>
      <div className={classes.header}>
        <div>
          <div className={classes.eyebrow}>Study monitoring</div>
          <h1 className={classes.title}>Participant dashboard</h1>
          <p className={classes.subtitle}>Project {MEDPLUM_PROJECT_ID}</p>
        </div>
        <Badge leftSection={<IconUsers size={14} />} variant="light" color="teal" size="lg">
          Practitioner view
        </Badge>
      </div>

      <div className={classes.statGrid}>
        <Metric label="Project patients" value={rows.length} />
        <Metric label="With observations" value={patientsWithData} />
        <Metric label="Observation records" value={totalObservations} />
        <Metric label="Questionnaires tracked" value={8} />
      </div>

      <section className={classes.panel}>
        <div className={classes.toolbar}>
          <div>
            <div className={classes.title}>Patients</div>
            <div className={classes.muted}>Only resources scoped to the configured Medplum project are listed.</div>
          </div>
          <Group gap="sm">
            <TextInput
              leftSection={<IconSearch size={16} />}
              placeholder="Search name, career, university"
              value={searchText}
              onChange={(e) => setSearchText(e.currentTarget.value)}
            />
            <Select
              data={sortOptions.map((option) => ({ value: option.value, label: option.label }))}
              value={sortBy}
              onChange={(value) => setSortBy((value as SortOption) ?? 'latest')}
              allowDeselect={false}
              aria-label="Sort by"
              w={160}
            />
          </Group>
        </div>

        {loading ? (
          <div className={classes.empty}>
            <Loader />
          </div>
        ) : filteredRows.length === 0 ? (
          <div className={classes.empty}>No patients found for this project.</div>
        ) : (
          <div className={classes.patientList}>
            {filteredRows.map((row) => (
              <Link className={classes.patientRow} to={`/Patient/${row.patient.id}/questionnaires`} key={row.patient.id}>
                <div>
                  <div className={classes.patientName}>{getPatientName(row.patient)}</div>
                  <div className={classes.muted}>{row.patient.id}</div>
                </div>
                <div>
                  <div className={classes.muted}>Age</div>
                  <div className={classes.metric}>{row.demographics?.age ?? '—'}</div>
                </div>
                <div>
                  <div className={classes.muted}>Career</div>
                  <div className={classes.metric}>{row.demographics?.career ?? '—'}</div>
                </div>
                <div>
                  <div className={classes.muted}>University</div>
                  <div className={classes.metric}>{row.demographics?.institution ?? '—'}</div>
                </div>
                <div>
                  <div className={classes.muted}>Questionnaires</div>
                  <div className={classes.metric}>{row.questionnairesAnswered}</div>
                </div>
                <div>
                  <div className={classes.muted}>Avance en la carrera</div>
                  <div className={classes.metric}>{row.demographics?.progressStage ?? '—'}</div>
                </div>
                <div>
                  <div className={classes.muted}>Convivencia</div>
                  <div className={classes.metric}>{row.demographics?.livingSituation ?? '—'}</div>
                </div>
                <Group justify="flex-end">
                  <IconArrowRight size={18} />
                </Group>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
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

function getPatientName(patient: Patient): string {
  const name = patient.name?.[0];
  const parts = [...(name?.given ?? []), name?.family].filter(Boolean);
  return parts.length > 0 ? parts.join(' ') : 'Unnamed patient';
}

function sortRows(rows: PatientSummaryRow[], sortBy: SortOption): PatientSummaryRow[] {
  if (sortBy === 'latest') {
    return rows;
  }
  const sorted = [...rows];
  sorted.sort((a, b) => {
    switch (sortBy) {
      case 'name':
        return getPatientName(a.patient).localeCompare(getPatientName(b.patient));
      case 'age':
        return compareNullable(a.demographics?.age, b.demographics?.age);
      case 'career':
        return compareNullable(a.demographics?.career, b.demographics?.career);
      case 'university':
        return compareNullable(a.demographics?.institution, b.demographics?.institution);
      default:
        return 0;
    }
  });
  return sorted;
}

// Sorts ascending; missing values always sort last regardless of direction.
function compareNullable(a: string | number | undefined, b: string | number | undefined): number {
  if (a === undefined && b === undefined) {
    return 0;
  }
  if (a === undefined) {
    return 1;
  }
  if (b === undefined) {
    return -1;
  }
  if (typeof a === 'number' && typeof b === 'number') {
    return a - b;
  }
  return String(a).localeCompare(String(b));
}
