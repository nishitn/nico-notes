import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ConvexReactClient } from 'convex/react';
import { ConvexAuthProvider } from '@convex-dev/auth/react';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import '@fontsource/epilogue/400.css';
import '@fontsource/epilogue/500.css';
import '@fontsource/epilogue/600.css';
import '@fontsource/epilogue/700.css';
import '@fontsource/plus-jakarta-sans/400.css';
import '@fontsource/plus-jakarta-sans/500.css';
import '@fontsource/plus-jakarta-sans/600.css';
import '@fontsource/plus-jakarta-sans/700.css';
import { App, Setup } from './App';
import { ErrorBoundary, Notices } from './ui';
import './styles.css';
import { UnsavedChangesBoundary } from './useUnsavedChanges';

const url = import.meta.env.VITE_CONVEX_URL;
const client = url ? new ConvexReactClient(url) : null;
const baseUrl = import.meta.env.BASE_URL.replace(/\/$/, '');
const router = createBrowserRouter(
  [
    {
      path: '*',
      element: (
        <UnsavedChangesBoundary>
          <ErrorBoundary>
            <Notices>
              {client ? (
                <ConvexAuthProvider client={client} storageNamespace="nico-notes">
                  <App />
                </ConvexAuthProvider>
              ) : (
                <Setup />
              )}
            </Notices>
          </ErrorBoundary>
        </UnsavedChangesBoundary>
      ),
    },
  ],
  { basename: baseUrl || '/' },
);
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
