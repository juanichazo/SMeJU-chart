// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Group, Loader, Paper, Stack, Text } from '@mantine/core';
import { calculateAgeString, capitalize, formatHumanName } from '@medplum/core';
import type { Patient } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react';
import { useEffect, useState } from 'react';
import type { JSX } from 'react';
import { useParams } from 'react-router';
import { PatientDetails } from '../components/PatientDetails';

export function PatientPage(): JSX.Element {
  const medplum = useMedplum();
  const { id } = useParams();
  const [patient, setPatient] = useState<Patient>();

  useEffect(() => {
    if (id) {
      medplum.readResource('Patient', id).then(setPatient).catch(console.error);
    }
  }, [medplum, id]);

  function onPatientChange(patient: Patient): void {
    setPatient(patient);
  }

  if (!patient) {
    return <Loader />;
  }

  return (
    <Stack gap={0}>
      <PatientHeader patient={patient} />
      <PatientDetails patient={patient} onChange={onPatientChange} />
    </Stack>
  );
}

// This study only tracks patient identity and questionnaire results — @medplum/react's PatientSummary
// pulls in 13 unrelated resource types (insurance, allergies, problems, medications, vitals, etc.) that
// aren't used here, so a minimal header replaces it instead. It's full-width and sticky (stays pinned
// below the app header while the questionnaire content scrolls underneath) rather than a side column,
// since the questionnaire results below are the actual point of this page.
function PatientHeader(props: { patient: Patient }): JSX.Element {
  const age = props.patient.birthDate ? calculateAgeString(props.patient.birthDate) : undefined;

  return (
    <Paper withBorder p="md" radius={0} style={{ position: 'sticky', top: 0, zIndex: 10 }}>
      <Group justify="space-between" wrap="wrap" gap="md">
        <Text fz="h4" fw={800}>
          {formatHumanName(props.patient.name?.[0])}
        </Text>
        <Group gap="lg">
          <Group gap={6}>
            <Text c="dimmed" size="sm">
              Birthdate:
            </Text>
            <Text size="sm">
              {props.patient.birthDate ? `${props.patient.birthDate}${age ? ` (${age})` : ''}` : 'Unknown'}
            </Text>
          </Group>
          <Group gap={6}>
            <Text c="dimmed" size="sm">
              Gender:
            </Text>
            <Text size="sm">{props.patient.gender ? capitalize(props.patient.gender) : 'Unknown'}</Text>
          </Group>
        </Group>
      </Group>
    </Paper>
  );
}
