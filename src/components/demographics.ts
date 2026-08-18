// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { getQuestionnaireAnswers } from '@medplum/core';
import type { MedplumClient } from '@medplum/core';
import type { Questionnaire, QuestionnaireResponseItemAnswer } from '@medplum/fhirtypes';
import demographicsQuestionnaire from '../../Questionnaires/DatosSociodemograficosEstudiantes.json';
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

export interface DemographicAnswer {
  linkId: string;
  question: string;
  answer: string;
}

function formatAnswerValue(answer: QuestionnaireResponseItemAnswer | undefined): string | undefined {
  if (!answer) {
    return undefined;
  }
  if (answer.valueCoding) {
    return answer.valueCoding.display ?? answer.valueCoding.code;
  }
  if (answer.valueString !== undefined) {
    return answer.valueString;
  }
  if (answer.valueInteger !== undefined) {
    return String(answer.valueInteger);
  }
  if (answer.valueDecimal !== undefined) {
    return String(answer.valueDecimal);
  }
  if (answer.valueBoolean !== undefined) {
    return answer.valueBoolean ? 'Sí' : 'No';
  }
  return undefined;
}

// Every question in the sociodemographic questionnaire, in questionnaire order, paired with the patient's
// most recent submitted answer. Questions the patient skipped (e.g. conditional follow-ups like
// "cantidad-mascotas" when they have no pets) are left out rather than shown as blank.
export async function getSociodemographicAnswers(medplum: MedplumClient, patientId: string): Promise<DemographicAnswer[] | undefined> {
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
  const items = (demographicsQuestionnaire as Questionnaire).item ?? [];
  const result: DemographicAnswer[] = [];
  for (const item of items) {
    if (!item.linkId) {
      continue;
    }
    const value = formatAnswerValue(answers[item.linkId]);
    if (value === undefined) {
      continue;
    }
    result.push({ linkId: item.linkId, question: item.text ?? item.linkId, answer: value });
  }
  return result;
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
