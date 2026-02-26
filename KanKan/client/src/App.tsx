import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Provider, useDispatch } from 'react-redux';
import { ThemeProvider, createTheme, CssBaseline } from '@mui/material';
import { store, AppDispatch } from './store';
import { Login } from './components/Auth/Login';
import { Register } from './components/Auth/Register';
import { ForgotPassword } from './components/Auth/ForgotPassword';
import { ChatLayout } from './components/Chat';
import { ContactsPage } from './components/Contacts/ContactsPage';
import { MomentsPage } from './components/Moments/MomentsPage';
import { ProfilePage } from './components/Profile/ProfilePage';
import { ChatRoom3DTestPage } from './components/Chat/ChatRoom3DTestPage';
import { authService } from './services/auth.service';
import { contactService } from './services/contact.service';
import { LanguageProvider } from './i18n/LanguageContext';
import { SettingsProvider } from './settings/SettingsContext';
import { setAuth } from './store/authSlice';

// Create MUI theme
const theme = createTheme({
  shape: {
    borderRadius: 16,
  },
  palette: {
    primary: {
      main: '#07c160', // Brand green
    },
    secondary: {
      main: '#576b95', // Brand blue
    },
    background: {
      default: 'rgba(244, 247, 251, 0.9)',
      paper: 'rgba(255, 255, 255, 0.6)',
    },
  },
  typography: {
    fontFamily: [
      '-apple-system',
      'BlinkMacSystemFont',
      '"Segoe UI"',
      '"Microsoft YaHei"',
      '"PingFang SC"',
      '"Noto Sans CJK SC"',
      '"Source Han Sans SC"',
      '"Hiragino Sans GB"',
      '"WenQuanYi Micro Hei"',
      '"Heiti SC"',
      '"SimHei"',
      'Roboto',
      '"Helvetica Neue"',
      'Arial',
      'sans-serif',
    ].join(','),
  },
  components: {
        MuiAvatar: {
          styleOverrides: {
            root: {
              borderRadius: 12,
              border: '1px solid rgba(255, 255, 255, 0.6)',
              boxSizing: 'border-box',
              backgroundClip: 'padding-box',
              backgroundImage:
                'linear-gradient(135deg, rgba(255,255,255,0.95), rgba(210,230,255,0.75)),\
                 linear-gradient(135deg, rgba(255,255,255,0.9), rgba(255,255,255,0.2))',
              backgroundOrigin: 'border-box',
              backgroundBlendMode: 'overlay',
              boxShadow: '0 6px 18px rgba(15, 23, 42, 0.15), inset 0 1px 0 rgba(255,255,255,0.8), inset 0 -1px 0 rgba(255,255,255,0.35)',
              background: 'linear-gradient(135deg, rgba(255,255,255,0.9), rgba(210,230,255,0.7))',
            },
          },
        },
        MuiButton: {
          styleOverrides: {
            root: {
              textTransform: 'none',
              borderRadius: 12,
              boxShadow: '0 8px 20px rgba(15, 23, 42, 0.12), inset 0 1px 0 rgba(255,255,255,0.8), inset 0 -1px 0 rgba(255,255,255,0.35)',
            },
            contained: {
              background: 'linear-gradient(135deg, rgba(7,193,96,0.9), rgba(35,208,124,0.85))',
              border: '1px solid rgba(255,255,255,0.4)',
            },
            outlined: {
              borderColor: 'rgba(255,255,255,0.5)',
              background: 'rgba(255,255,255,0.4)',
            },
          },
        },
        MuiIconButton: {
          styleOverrides: {
            root: {
              borderRadius: 12,
              background: 'rgba(255,255,255,0.45)',
              border: '1px solid rgba(255,255,255,0.5)',
              boxShadow: '0 8px 20px rgba(15, 23, 42, 0.12), inset 0 1px 0 rgba(255,255,255,0.8), inset 0 -1px 0 rgba(255,255,255,0.35)',
            },
          },
        },
        MuiListItemButton: {
          styleOverrides: {
            root: {
              borderRadius: 14,
              margin: '4px 8px',
              background: 'rgba(255,255,255,0.55)',
              border: '1px solid rgba(255,255,255,0.5)',
              boxShadow: '0 8px 20px rgba(15, 23, 42, 0.12), inset 0 1px 0 rgba(255,255,255,0.75), inset 0 -1px 0 rgba(255,255,255,0.3)',
            },
          },
        },
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          backgroundColor: 'transparent',
        },
      },
    },
    MuiAppBar: {
      styleOverrides: {
        root: {
          background: 'rgba(255, 255, 255, 0.65)',
          borderBottom: '1px solid rgba(255, 255, 255, 0.5)',
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          background: 'rgba(255, 255, 255, 0.6)',
          border: '1px solid rgba(255, 255, 255, 0.5)',
          boxShadow: '0 10px 30px rgba(15, 23, 42, 0.08)',
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          background: 'rgba(255, 255, 255, 0.6)',
          border: '1px solid rgba(255, 255, 255, 0.5)',
          boxShadow: '0 10px 30px rgba(15, 23, 42, 0.08)',
        },
      },
    },
    MuiDialog: {
      styleOverrides: {
        paper: {
          background: 'rgba(255, 255, 255, 0.7)',
          border: '1px solid rgba(255, 255, 255, 0.5)',
          boxShadow: '0 12px 40px rgba(15, 23, 42, 0.12)',
        },
      },
    },
    MuiTextField: {
      defaultProps: {
        InputLabelProps: {
          shrink: true,
        },
      },
      styleOverrides: {
        root: {
          '& .MuiOutlinedInput-root': {
            background: 'rgba(255, 255, 255, 0.6)',
          },
          '& .MuiInputLabel-root': {
            zIndex: 1,
          },
          '& .MuiInputLabel-root.MuiInputLabel-shrink': {
            backgroundColor: '#fff',
            padding: '0 4px',
          },
        },
      },
    },
  },
});

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
          <ThemeProvider theme={theme}>
            <CssBaseline />
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

              {/* Default redirect */}
              <Route path="/" element={<Navigate to="/login" replace />} />
              <Route path="*" element={<Navigate to="/login" replace />} />
              </Routes>
            </BrowserRouter>
          </ThemeProvider>
        </LanguageProvider>
      </SettingsProvider>
    </Provider>
  );
}

export default App;
