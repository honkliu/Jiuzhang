import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Provider, useDispatch } from 'react-redux';
import { store, AppDispatch } from './store';
import { Login } from './components/Auth/Login';
import { Register } from './components/Auth/Register';
import { ForgotPassword } from './components/Auth/ForgotPassword';
import { ChatLayout } from './components/Chat';
import { ContactsPage } from './components/Contacts/ContactsPage';
import { MomentsPage } from './components/Moments/MomentsPage';
import { ProfilePage } from './components/Profile/ProfilePage';
import { ChatRoom3DTestPage } from './components/Chat/ChatRoom3DTestPage';
import { FamilyPage } from './components/Family/FamilyPage';
import { NotebookPage } from './components/Notebook/NotebookPage';
import { ReceiptsPage } from './components/Receipts/ReceiptsPage';
import { GalleryPage } from './components/Gallery/GalleryPage';
import { InviteCodesPage } from './components/Admin/InviteCodesPage';
import { AccessConfigPage } from './components/Admin/AccessConfigPage';
import { authService } from './services/auth.service';
import { contactService } from './services/contact.service';
import { LanguageProvider } from './i18n/LanguageContext';
import { SettingsProvider } from './settings/SettingsContext';
import { SkinProvider } from './skins/SkinContext';
import { setAuth } from './store/authSlice';

const GamesPage = React.lazy(() => import('./components/Games/GamesPage'));
const HelpPage = React.lazy(() => import('./components/Help/HelpPage'));

// Protected Route component
const ProtectedRoute: React.FC<{ children: React.ReactElement }> = ({ children }) => {
  const isAuthenticated = authService.isAuthenticated();
  return isAuthenticated ? children : <Navigate to="/login" replace />;
};

// Public Route component (redirect to chats if already authenticated)
const PublicRoute: React.FC<{ children: React.ReactElement }> = ({ children }) => {
  const isAuthenticated = authService.isAuthenticated();
  return isAuthenticated ? <Navigate to="/chats" replace /> : children;
};

const AuthBootstrap: React.FC = () => {
  const dispatch = useDispatch<AppDispatch>();

  React.useEffect(() => {
    const accessToken = authService.getAccessToken();
    const storedUser = authService.getCurrentUser();

    if (accessToken && storedUser) {
      dispatch(setAuth({ accessToken, user: storedUser }));
      return;
    }

    if (accessToken && !storedUser) {
      contactService.getCurrentUser()
        .then((user) => {
          authService.saveAuth(accessToken, user);
          dispatch(setAuth({ accessToken, user }));
        })
        .catch(() => {
          // Keep auth state unchanged; protected routes will handle invalid sessions.
        });
    }
  }, [dispatch]);

  return null;
};

function App() {
  return (
    <Provider store={store}>
      <SettingsProvider>
        <LanguageProvider>
          <SkinProvider>
            <BrowserRouter>
              <AuthBootstrap />
              <Routes>
              {/* Public routes */}
              <Route
                path="/login"
                element={
                  <PublicRoute>
                    <Login />
                  </PublicRoute>
                }
              />
              <Route
                path="/register"
                element={
                  <PublicRoute>
                    <Register />
                  </PublicRoute>
                }
              />
              <Route
                path="/forgot-password"
                element={
                  <PublicRoute>
                    <ForgotPassword />
                  </PublicRoute>
                }
              />
              <Route path="/room3d-test" element={<ChatRoom3DTestPage />} />

              {/* Protected routes */}
              <Route
                path="/chats"
                element={
                  <ProtectedRoute>
                    <ChatLayout />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/contacts"
                element={
                  <ProtectedRoute>
                    <ContactsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/pa"
                element={
                  <ProtectedRoute>
                    <MomentsPage />
                  </ProtectedRoute>
                }
              />
              <Route path="/moments" element={<Navigate to="/pa" replace />} />
              <Route
                path="/profile"
                element={
                  <ProtectedRoute>
                    <ProfilePage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/family"
                element={
                  <ProtectedRoute>
                    <FamilyPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/notebook"
                element={
                  <ProtectedRoute>
                    <NotebookPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/receipts"
                element={
                  <ProtectedRoute>
                    <ReceiptsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/gallery"
                element={
                  <ProtectedRoute>
                    <GalleryPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/games"
                element={
                  <ProtectedRoute>
                    <React.Suspense fallback={null}>
                      <GamesPage />
                    </React.Suspense>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/help"
                element={
                  <ProtectedRoute>
                    <React.Suspense fallback={null}>
                      <HelpPage />
                    </React.Suspense>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/photos"
                element={
                  <ProtectedRoute>
                    <Navigate to="/receipts?view=photos" replace />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin"
                element={
                  <ProtectedRoute>
                    <InviteCodesPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/access-config"
                element={
                  <ProtectedRoute>
                    <AccessConfigPage />
                  </ProtectedRoute>
                }
              />

              {/* Default redirect */}
              <Route path="/" element={<Navigate to="/login" replace />} />
              <Route path="*" element={<Navigate to="/login" replace />} />
              </Routes>
            </BrowserRouter>
          </SkinProvider>
        </LanguageProvider>
      </SettingsProvider>
    </Provider>
  );
}

export default App;
