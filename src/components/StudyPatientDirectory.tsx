// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Badge, Group, Loader, TextInput } from '@mantine/core';
import type { Observation, Patient, Resource } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react';
import { IconArrowRight, IconSearch, IconUsers } from '@tabler/icons-react';
import { useEffect, useMemo, useState } from 'react';
import type { JSX } from 'react';
import { Link } from 'react-router';
import { MEDPLUM_PROJECT_ID } from '../config';
import classes from './StudyDashboard.module.css';

interface PatientSummaryRow {
  patient: Patient;
  observationCount: number;
  lastObservation?: string;
}

interface ProjectMeta {
  project?: string;
  compartment?: { reference?: string }[];
}

export function StudyPatientDirectory(): JSX.Element {
  const medplum = useMedplum();
  const [rows, setRows] = useState<PatientSummaryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchText, setSearchText] = useState('');

  useEffect(() => {
    let alive = true;

    async function loadPatients(): Promise<void> {
      setLoading(true);
      try {
        const { patients, serverConstrained } = await searchProjectPatients();
        const visiblePatients = filterProjectResources(patients, serverConstrained);
        const summaries = await Promise.all(
          visiblePatients.map(async (patient) => {
            const observations = await searchPatientObservations(patient.id as string);
            return {
              patient,
              observationCount: observations.length,
              lastObservation: observations[0]?.effectiveDateTime ?? observations[0]?.issued,
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

    async function searchProjectPatients(): Promise<{ patients: Patient[]; serverConstrained: boolean }> {
      try {
        const patients = await medplum.searchResources('Patient', {
          _count: 100,
          _sort: '-_lastUpdated',
          _project: MEDPLUM_PROJECT_ID,
        } as Record<string, string | number>);
        return { patients, serverConstrained: true };
      } catch (err) {
        console.warn('Project search parameter unavailable; falling back to resource metadata filtering.', err);
        const patients = await medplum.searchResources('Patient', {
          _count: 100,
          _sort: '-_lastUpdated',
        } as Record<string, string | number>);
        return { patients, serverConstrained: false };
      }
    }

    async function searchPatientObservations(patientId: string): Promise<Observation[]> {
      try {
        return await medplum.searchResources('Observation', {
          patient: `Patient/${patientId}`,
          _count: 200,
          _sort: '-date',
          _project: MEDPLUM_PROJECT_ID,
        } as Record<string, string | number>);
      } catch (_err) {
        const observations = await medplum.searchResources('Observation', {
          patient: `Patient/${patientId}`,
          _count: 200,
          _sort: '-date',
        } as Record<string, string | number>);
        return filterProjectResources(observations, false);
      }
    }

    loadPatients().catch(console.error);

    return () => {
      alive = false;
    };
  }, [medplum]);

  const filteredRows = useMemo(() => {
    const query = searchText.trim().toLowerCase();
    if (!query) {
      return rows;
    }
    return rows.filter((row) => getPatientName(row.patient).toLowerCase().includes(query));
  }, [rows, searchText]);

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
        <Metric label="Questionnaires tracked" value={7} />
      </div>

      <section className={classes.panel}>
        <div className={classes.toolbar}>
          <div>
            <div className={classes.title}>Patients</div>
            <div className={classes.muted}>Only resources scoped to the configured Medplum project are listed.</div>
          </div>
          <TextInput
            leftSection={<IconSearch size={16} />}
            placeholder="Search patients"
            value={searchText}
            onChange={(e) => setSearchText(e.currentTarget.value)}
          />
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
              <Link className={classes.patientRow} to={`/Patient/${row.patient.id}/observations`} key={row.patient.id}>
                <div>
                  <div className={classes.patientName}>{getPatientName(row.patient)}</div>
                  <div className={classes.muted}>{row.patient.id}</div>
                </div>
                <div>
                  <div className={classes.muted}>Birth date</div>
                  <div className={classes.metric}>{row.patient.birthDate ?? 'Unknown'}</div>
                </div>
                <div>
                  <div className={classes.muted}>Gender</div>
                  <div className={classes.metric}>{row.patient.gender ?? 'Unknown'}</div>
                </div>
                <div>
                  <div className={classes.muted}>Latest data</div>
                  <div className={classes.metric}>{formatDate(row.lastObservation)}</div>
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

function filterProjectResources<T extends Resource>(resources: T[], serverConstrained: boolean): T[] {
  return resources.filter((resource) => {
    const meta = resource.meta as ProjectMeta | undefined;
    const projectReference = `Project/${MEDPLUM_PROJECT_ID}`;
    const hasProjectMeta = Boolean(meta?.project || meta?.compartment?.length);
    const belongsToProject =
      meta?.project === MEDPLUM_PROJECT_ID || meta?.compartment?.some((item) => item.reference === projectReference);
    return belongsToProject || (serverConstrained && !hasProjectMeta);
  });
}

function getPatientName(patient: Patient): string {
  const name = patient.name?.[0];
  const parts = [...(name?.given ?? []), name?.family].filter(Boolean);
  return parts.length > 0 ? parts.join(' ') : 'Unnamed patient';
}

function formatDate(value: string | undefined): string {
  if (!value) {
    return 'No data';
  }
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(value));
}
