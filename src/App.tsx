// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { AppShell, ErrorBoundary, Loading, Logo, useMedplum, useMedplumProfile } from '@medplum/react';
import {
  IconClipboardData,
  IconClipboardHeart,
  IconClipboardList,
  IconDatabaseImport,
  IconHealthRecognition,
  IconQuestionMark,
  IconRobot,
  IconUser,
} from '@tabler/icons-react';
import { Suspense } from 'react';
import type { JSX } from 'react';
import { Link, Navigate, Route, Routes } from 'react-router';
import { StudyPatientDirectory } from './components/StudyPatientDirectory';
import { EncounterPage } from './pages/EncounterPage';
import { LandingPage } from './pages/LandingPage';
import { PatientPage } from './pages/PatientPage';
import { ResourcePage } from './pages/ResourcePage';
import { SearchPage } from './pages/SearchPage';
import { SignInPage } from './pages/SignInPage';
import { UploadDataPage } from './pages/UploadDataPage';

export function App(): JSX.Element | null {
  const medplum = useMedplum();
  const profile = useMedplumProfile();

  if (medplum.isLoading()) {
    return null;
  }

  return (
    <AppShell
      // AppShell wraps `logo` in its own button that toggles the (now-empty) navbar — stopPropagation so
      // this click only navigates home (the patient list) instead of also toggling that empty sidebar.
      logo={
        <Link to="/" onClick={(e) => e.stopPropagation()}>
          <Logo size={24} />
        </Link>
      }
      // The left nav bar is hidden entirely: Study Dashboard is now the home page (/), so there's nothing
      // left worth navigating to from a sidebar. Routes still work via direct URL. Uncomment to restore.
      menus={[
        // {
        //   title: 'Charts',
        //   links: [
        //     { icon: <IconUser />, label: 'Patients', href: '/Patient' },
        //     { icon: <IconClipboardData />, label: 'Study Dashboard', href: '/study' },
        //   ],
        // },
        // {
        //   title: 'Encounters',
        //   links: [
        //     { icon: <IconClipboardList />, label: 'All Encounters', href: '/Encounter' },
        //     {
        //       icon: <IconClipboardHeart />,
        //       label: 'My Encounters',
        //       href: `/Encounter?participant=Practitioner/${profile?.id}`,
        //     },
        //   ],
        // },
        // {
        //   title: 'Upload Data',
        //   links: [
        //     { icon: <IconDatabaseImport />, label: 'Upload Core ValueSets', href: '/upload/core' },
        //     { icon: <IconQuestionMark />, label: 'Upload Questionnaires', href: '/upload/questionnaire' },
        //     { icon: <IconRobot />, label: 'Upload Example Bots', href: '/upload/bots' },
        //     { icon: <IconHealthRecognition />, label: 'Upload Example Patient Data', href: '/upload/example' },
        //   ],
        // },
      ]}
    >
      <ErrorBoundary>
        <Suspense fallback={<Loading />}>
          <Routes>
            <Route path="/" element={profile ? <StudyPatientDirectory /> : <LandingPage />} />
            <Route path="/signin" element={<SignInPage />} />
            <Route path="/study" element={<StudyPatientDirectory />} />
            {/* The generic Patient list is disabled — patients are found via the Study Dashboard now. */}
            <Route path="/Patient" element={<Navigate to="/study" replace />} />
            <Route path="/Patient/:id">
              <Route index element={<PatientPage />} />
              <Route path="*" element={<PatientPage />} />
            </Route>
            <Route path="/:resourceType/:id">
              <Route index element={<ResourcePage />} />
              <Route path="*" element={<ResourcePage />} />
            </Route>
            <Route path="/:resourceType" element={<SearchPage />} />
            <Route path="/Encounter/:id">
              <Route index element={<EncounterPage />} />
              <Route path="*" element={<EncounterPage />} />
            </Route>
            <Route path="/upload/:dataType" element={<UploadDataPage />} />
          </Routes>
        </Suspense>
      </ErrorBoundary>
    </AppShell>
  );
}
