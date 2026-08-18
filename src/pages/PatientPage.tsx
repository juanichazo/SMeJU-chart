// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Group, Loader, Paper, Stack, Text } from '@mantine/core';
import { calculateAgeString, formatHumanName } from '@medplum/core';
import type { Patient } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react';
import { useEffect, useState } from 'react';
import type { JSX } from 'react';
import { useParams } from 'react-router';
import { PatientDetails } from '../components/PatientDetails';
import type { DemographicInfo } from '../components/demographics';
import { getLatestDemographics } from '../components/demographics';

export function PatientPage(): JSX.Element {
  const medplum = useMedplum();
  const { id } = useParams();
  const [patient, setPatient] = useState<Patient>();
  const [demographics, setDemographics] = useState<DemographicInfo>();

  useEffect(() => {
    if (id) {
      medplum.readResource('Patient', id).then(setPatient).catch(console.error);
    }
  }, [medplum, id]);

  useEffect(() => {
    if (patient?.id) {
      getLatestDemographics(medplum, patient.id).then(setDemographics).catch(console.error);
    }
  }, [medplum, patient?.id]);

  function onPatientChange(patient: Patient): void {
    setPatient(patient);
  }

  if (!patient) {
    return <Loader />;
  }

  return (
    <Stack gap={0}>
      <PatientHeader patient={patient} demographics={demographics} />
      <PatientDetails patient={patient} onChange={onPatientChange} />
    </Stack>
  );
}

// This study only tracks patient identity and questionnaire results — @medplum/react's PatientSummary
// pulls in 13 unrelated resource types (insurance, allergies, problems, medications, vitals, etc.) that
// aren't used here, so a minimal header replaces it instead. It's full-width and sticky (stays pinned
// below the app header while the questionnaire content scrolls underneath) rather than a side column,
// since the questionnaire results below are the actual point of this page.
function PatientHeader(props: { patient: Patient; demographics?: DemographicInfo }): JSX.Element {
  const age = props.patient.birthDate ? calculateAgeString(props.patient.birthDate) : undefined;
  const demographics = props.demographics;

  function translateGender(gender: string): string {
    switch (gender) {
      case 'male':
        return 'Masculino';
      case 'female':
        return 'Femenino';
      case 'other':
        return 'Otro';
      default:
        return 'Desconocido';
    }
  }

  return (
    <Paper withBorder p="md" radius={0} style={{ position: 'sticky', top: 0, zIndex: 10 }}>
      <Group justify="space-between" wrap="wrap" gap="md">
        <Text fz="h4" fw={800}>
          {formatHumanName(props.patient.name?.[0])}
        </Text>
        <Group gap="lg">
          <Group gap={6}>
            <Text c="dimmed" size="sm">
              Fecha de nacimiento:
            </Text>
            <Text size="sm">
              {props.patient.birthDate ? `${props.patient.birthDate}${age ? ` (${age})` : ''}` : 'Desconocida'}
            </Text>
          </Group>
          <Group gap={6}>
            <Text c="dimmed" size="sm">
              Género:
            </Text>
            <Text size="sm">{props.patient.gender ? translateGender(props.patient.gender) : 'Desconocido'}</Text>
          </Group>
        </Group>
      </Group>
      {/* From the "Datos sociodemográficos" questionnaire — only shown when the patient has submitted it. */}
      {demographics && (demographics.age !== undefined || demographics.career || demographics.institution) && (
        <Group gap="lg" mt={8}>
          {demographics.age !== undefined && (
            <Group gap={6}>
              <Text c="dimmed" size="sm">
                Edad autoinformada:
              </Text>
              <Text size="sm">{demographics.age}</Text>
            </Group>
          )}
          {demographics.career && (
            <Group gap={6}>
              <Text c="dimmed" size="sm">
                Carrera:
              </Text>
              <Text size="sm">{demographics.career}</Text>
            </Group>
          )}
          {demographics.institution && (
            <Group gap={6}>
              <Text c="dimmed" size="sm">
                Universidad:
              </Text>
              <Text size="sm">{demographics.institution}</Text>
            </Group>
          )}
        </Group>
      )}
    </Paper>
  );
}
