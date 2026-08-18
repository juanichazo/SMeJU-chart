// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Text, Title } from '@mantine/core';
import { Logo, SignInForm } from '@medplum/react';
import type { JSX } from 'react';
import { useNavigate } from 'react-router';
import { getConfig } from '../config';

export function SignInPage(): JSX.Element {
  const navigate = useNavigate();
  return (
    <SignInForm
      // Configure according to your settings
      googleClientId={getConfig().googleClientId}
      onSuccess={() => navigate('/')?.catch(console.error)}
      clientId={getConfig().clientId}
    >
      <Logo size={32} />
      <Title>Seguimiento</Title>
      <Text size="sm" ta="center">
        Panel de seguimiento para el equipo de salud: permite consultar la lista de participantes del
        estudio y revisar los resultados de los cuestionarios de tamizaje psicosocial que fueron
        completando a lo largo del tiempo.
      </Text>
      <Text size="xs" c="dimmed" ta="center">
        Incluye cuestionarios como PHQ-9 (depresión), GAD-7 (ansiedad), AUDIT (consumo de alcohol), CTQ-SF
        (trauma en la infancia), HITS (violencia doméstica), MOS-SSS (apoyo social) y datos
        sociodemográficos, entre otros.
      </Text>
    </SignInForm>
  );
}
