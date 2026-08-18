// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Button, Stack, Text, Title } from '@mantine/core';
import { Document } from '@medplum/react';
import type { JSX } from 'react';
import { Link } from 'react-router';

export function LandingPage(): JSX.Element {
  return (
    <Document width={560}>
      <Stack align="center" gap="md">
        <Title order={1} fz={32} ta="center">
          Seguimiento
        </Title>
        <Text ta="center">
          Panel de seguimiento para el equipo de salud: permite consultar la lista de participantes del
          estudio y revisar los resultados de los cuestionarios de tamizaje psicosocial que fueron
          completando a lo largo del tiempo.
        </Text>
        <Text size="sm" c="dimmed" ta="center">
          Incluye cuestionarios como PHQ-9 (depresión), GAD-7 (ansiedad), AUDIT (consumo de alcohol), CTQ-SF
          (trauma en la infancia), HITS (violencia doméstica), MOS-SSS (apoyo social) y datos
          sociodemográficos, entre otros.
        </Text>
        <Text ta="center">Iniciá sesión con tu cuenta de practicante para acceder al panel.</Text>
        <Button component={Link} to="/signin" size="lg" radius="xl">
          Iniciar sesión
        </Button>
      </Stack>
    </Document>
  );
}
