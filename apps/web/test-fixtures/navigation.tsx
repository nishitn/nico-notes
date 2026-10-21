import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider, Link, useNavigate } from 'react-router-dom';
import { UnsavedChangesBoundary, useUnsavedChanges } from '../src/useUnsavedChanges';
function Editor() {
  const [value, setValue] = useState('');
  const guard = useUnsavedChanges(!!value);
  const navigate = useNavigate();
  return (
    <>
      <h1>Editor</h1>
      <input aria-label="Draft" value={value} onChange={(event) => setValue(event.target.value)} />
      <Link to="/test-fixtures/done">Leave</Link>
      <button
        onClick={() => {
          guard.allowNavigation();
          navigate('/test-fixtures/done');
        }}
      >
        Save
      </button>
    </>
  );
}
const router = createBrowserRouter([
  {
    path: '/test-fixtures/navigation.html',
    element: (
      <UnsavedChangesBoundary>
        <Editor />
      </UnsavedChangesBoundary>
    ),
  },
  {
    path: '/test-fixtures/done',
    element: (
      <UnsavedChangesBoundary>
        <h1>Next</h1>
        <Link to="/test-fixtures/navigation.html">Open editor</Link>
      </UnsavedChangesBoundary>
    ),
  },
]);
createRoot(document.getElementById('root')!).render(<RouterProvider router={router} />);
