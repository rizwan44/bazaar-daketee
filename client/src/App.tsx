import { RouterProvider } from 'react-router-dom';
import { router } from './app/router';
import { I18nProvider } from './i18n/i18nContext';

export function App() {
  return (
    <I18nProvider>
      <RouterProvider router={router} />
    </I18nProvider>
  );
}
