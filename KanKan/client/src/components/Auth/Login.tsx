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
} from '@mui/material';
import kankanLogo24 from '@/assets/brand/kankan-96-q95.jpg';
import { authService } from '@/services/auth.service';
import { useDispatch } from 'react-redux';
import { setAuth } from '@/store/authSlice';
import { useLanguage } from '@/i18n/LanguageContext';
import './Login.css';

export const Login: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { t, language } = useLanguage();
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

  return (
    <Container component="main" maxWidth="xs">
      <div className="loginContainer">
        <Paper elevation={3} sx={{ p: 4, width: '100%' }}>
          <div className="loginTitleRow">
            <img src={kankanLogo24} alt="KanKan" className="loginLogo" />
            <Typography component="h1" variant="h4" className="loginTitleText">
              {language === 'zh' ? '欢迎你' : t('auth.login.title')}
            </Typography>
          </div>

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
            />

            <div className="loginOptionsRow">
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
                className="loginLink loginLinkSmall"
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

            <div className="loginFooter">
              <Typography variant="body2" color="text.secondary">
                {t('auth.login.noAccount')}{' '}
                <Link to="/register" className="loginLink loginLinkStrong">
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
