import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  TextField,
  Button,
  Typography,
  Container,
  Paper,
  Alert,
  CircularProgress,
  Checkbox,
  FormControlLabel,
  Divider,
} from '@mui/material';
import { authService } from '@/services/auth.service';
import { useDispatch } from 'react-redux';
import { setAuth } from '@/store/authSlice';
import { useLanguage } from '@/i18n/LanguageContext';

export const Login: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { t } = useLanguage();
  const navigate = useNavigate();
  const dispatch = useDispatch();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await authService.login({ email, password });

      // Store token and user info
      authService.saveAuth(response.accessToken, response.user);
      dispatch(setAuth(response));

      if (rememberMe) {
        localStorage.setItem('rememberMe', 'true');
      }

      // Redirect to main app
      navigate('/chats');
    } catch (err: any) {
      setError(err.message || t('auth.login.failed'));
    } finally {
      setLoading(false);
    }
  };

  const quickLoginPassword = import.meta.env.VITE_QUICK_LOGIN_PASSWORD || '';

  const quickLogin = async (quickEmail: string) => {
    setError('');
    setLoading(true);
    try {
      if (!quickLoginPassword) {
        setError('Quick login password is not configured.');
        return;
      }
      const response = await authService.login({ email: quickEmail, password: quickLoginPassword });
      authService.saveAuth(response.accessToken, response.user);
      dispatch(setAuth(response));
      navigate('/chats');
    } catch (err: any) {
      setError(err.message || t('auth.login.failed'));
    } finally {
      setLoading(false);
    }
  };

  const containerStyle: React.CSSProperties = {
    marginTop: 64,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
  };

  const fieldSx = {
    '& .MuiOutlinedInput-root': {
      bgcolor: 'background.paper',
    },
    '& .MuiInputLabel-root.MuiInputLabel-shrink': {
      bgcolor: 'background.paper',
      px: 0.5,
    },
  };

  return (
    <Container component="main" maxWidth="xs">
      <div style={containerStyle}>
        <Paper elevation={3} sx={{ p: 4, width: '100%' }}>
          <Typography component="h1" variant="h4" align="center" gutterBottom>
            {t('auth.login.title')}
          </Typography>

          <Typography variant="body2" color="text.secondary" align="center" sx={{ mb: 3 }}>
            {t('auth.login.subtitle')}
          </Typography>

          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}

          <form onSubmit={handleSubmit}>
            <TextField
              margin="normal"
              required
              fullWidth
              id="email"
              label={t('auth.login.email')}
              name="email"
              autoComplete="email"
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="text"
              disabled={loading}
              sx={fieldSx}
            />

            <TextField
              margin="normal"
              required
              fullWidth
              name="password"
              label={t('auth.login.password')}
              type="password"
              id="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
              sx={fieldSx}
            />

            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginTop: 8,
              }}
            >
              <FormControlLabel
                control={
                  <Checkbox
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    color="primary"
                    disabled={loading}
                  />
                }
                label={t('auth.login.remember')}
              />
              <Link
                to="/forgot-password"
                style={{
                  color: '#1976d2',
                  textDecoration: 'none',
                  fontSize: '0.875rem',
                }}
              >
                {t('auth.login.forgot')}
              </Link>
            </div>

            <Button
              type="submit"
              fullWidth
              variant="contained"
              size="large"
              sx={{ mt: 3, mb: 2 }}
              disabled={loading}
            >
              {loading ? <CircularProgress size={24} /> : t('auth.login.signIn')}
            </Button>

            <Divider sx={{ my: 2 }}>
              <Typography variant="body2" color="text.secondary">
                {t('auth.login.or')}
              </Typography>
            </Divider>

            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
              <Button
                fullWidth
                variant="outlined"
                onClick={() => quickLogin('alice@example.com')}
                disabled={loading}
              >
                Alice
              </Button>
              <Button
                fullWidth
                variant="outlined"
                onClick={() => quickLogin('bob@example.com')}
                disabled={loading}
              >
                Bob
              </Button>
              <Button
                fullWidth
                variant="outlined"
                onClick={() => quickLogin('carol@example.com')}
                disabled={loading}
              >
                Carol
              </Button>
            </div>

            <div style={{ textAlign: 'center' }}>
              <Typography variant="body2" color="text.secondary">
                {t('auth.login.noAccount')}{' '}
                <Link to="/register" style={{ color: '#1976d2', textDecoration: 'none', fontWeight: 500 }}>
                  {t('auth.login.create')}
                </Link>
              </Typography>
            </div>
          </form>
        </Paper>
      </div>
    </Container>
  );
};
