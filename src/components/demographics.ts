// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { getQuestionnaireAnswers } from '@medplum/core';
import type { MedplumClient } from '@medplum/core';
import { TRACKED_QUESTIONNAIRE_URLS } from './trackedQuestionnaires';

// From Questionnaires/DatosSociodemograficosEstudiantes.json's own `url` field. This questionnaire has no
// bot converting its answers into Observations (unlike PHQ-9/GAD-7/etc.), so its data only ever exists in
// QuestionnaireResponse.item[].answer[] — it must be read directly from the response, not derived.
export const DEMOGRAPHICS_QUESTIONNAIRE_URL = 'https://example.org/fhir/Questionnaire/datos-sociodemograficos-estudiantes';

export interface DemographicInfo {
  name?: string;
  age?: number;
  career?: string;
  /** From the "facultad" (faculty/institution) question — the closest field to "University" in this questionnaire. */
  institution?: string;
  /** "avance-carrera" — stage/year of the student's degree. */
  progressStage?: string;
  /** "convivencia" — who the student currently lives with. */
  livingSituation?: string;
  /** "gestion-facultad" — whether their institution is public or private. */
  institutionType?: string;
}

export async function getLatestDemographics(medplum: MedplumClient, patientId: string): Promise<DemographicInfo | undefined> {
  const [response] = await medplum.searchResources('QuestionnaireResponse', {
    patient: `Patient/${patientId}`,
    questionnaire: DEMOGRAPHICS_QUESTIONNAIRE_URL,
    _sort: '-authored',
    _count: 1,
  });
  if (!response) {
    return undefined;
  }

  const answers = getQuestionnaireAnswers(response);
  return {
    name: answers['nombre']?.valueString,
    age: answers['edad']?.valueInteger,
    career: answers['carrera']?.valueString,
    institution: answers['facultad']?.valueString,
    progressStage: answers['avance-carrera']?.valueCoding?.display,
    livingSituation: answers['convivencia']?.valueCoding?.display,
    institutionType: answers['gestion-facultad']?.valueCoding?.display,
  };
}

// Counts distinct study questionnaires (from the tracked-questionnaire allowlist, so clinical encounter
// notes never inflate this) the patient has submitted at least one response to.
export async function countAnsweredQuestionnaires(medplum: MedplumClient, patientId: string): Promise<number> {
  const responses = await medplum.searchResources('QuestionnaireResponse', {
    patient: `Patient/${patientId}`,
    _count: 200,
  });
  const answered = new Set<string>();
  for (const response of responses) {
    const url = response.questionnaire?.split('|')[0];
    if (url && TRACKED_QUESTIONNAIRE_URLS.has(url)) {
      answered.add(url);
    }
  }
  return answered.size;
}
