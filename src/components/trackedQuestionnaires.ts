// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Questionnaire } from '@medplum/fhirtypes';
import audit from '../../Questionnaires/AUDIT.json';
import ctq from '../../Questionnaires/CTQ-SF.json';
import demographics from '../../Questionnaires/DatosSociodemograficosEstudiantes.json';
import gad from '../../Questionnaires/GAD-7.json';
import hits from '../../Questionnaires/HITS.json';
import mos from '../../Questionnaires/MOS-SSS.json';
import phq from '../../Questionnaires/PHQ-9.json';
import sdoh from '../../Questionnaires/SDOH.json';

export interface LocalQuestionnaire {
  url: string;
  title: string;
  name?: string;
}

// Shared across the Study Dashboard components: the 8 screening/sociodemographic questionnaires this study
// tracks, sourced from the `Questionnaires/` directory. Kept separate from the 3 encounter-note
// questionnaires (data/core/encounter-note-questionnaires.json), which are clinical notes, not
// participant-filled screening tools, and must never be counted or displayed here.
export const localQuestionnaires: LocalQuestionnaire[] = [audit, ctq, demographics, gad, hits, mos, phq, sdoh]
  .map((q) => q as Questionnaire)
  .filter((q): q is Questionnaire & { url: string } => Boolean(q.url))
  .map((q) => ({ url: q.url, title: q.title ?? q.name ?? 'Questionnaire', name: q.name }));

export const localQuestionnairesByUrl = new Map(localQuestionnaires.map((q) => [q.url, q]));

export const TRACKED_QUESTIONNAIRE_URLS = new Set(localQuestionnaires.map((q) => q.url));
