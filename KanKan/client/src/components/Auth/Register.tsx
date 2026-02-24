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
  Step,
  Stepper,
  StepLabel,
} from '@mui/material';
import { authService } from '@/services/auth.service';
import { useDispatch } from 'react-redux';
import { setAuth } from '@/store/authSlice';
import { useLanguage } from '@/i18n/LanguageContext';

export const Register: React.FC = () => {
  const [activeStep, setActiveStep] = useState(0);
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setErrorState] = useState('');
  const [loading, setLoading] = useState(false);
  const { t } = useLanguage();
  const navigate = useNavigate();
  const dispatch = useDispatch();

  const steps = [t('auth.register.steps.email'), t('auth.register.steps.verify')];

  const handleSendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorState('');
    setLoading(true);

    try {
      await authService.register({ email });
      setActiveStep(1);
    } catch (err: any) {
      setErrorState(err.message || t('auth.register.sendFailed'));
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyAndRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorState('');

    // Validation
    if (password !== confirmPassword) {
      setErrorState(t('auth.register.passwordMismatch'));
      return;
    }

    if (password.length < 8) {
      setErrorState(t('auth.register.passwordLength'));
      return;
    }

    if (displayName.length < 2) {
      setErrorState(t('auth.register.displayNameLength'));
      return;
    }

    setLoading(true);

    try {
      const response = await authService.verifyEmail({
        email,
        code,
        password,
        displayName,
      });

      // Store token and user info
      authService.saveAuth(response.accessToken, response.user);
      dispatch(setAuth(response));

      // Redirect to main app
      navigate('/chats');
    } catch (err: any) {
      setErrorState(err.message || t('auth.register.verifyFailed'));
    } finally {
      setLoading(false);
    }
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
    <Container component="main" maxWidth="sm">
      <div style={{ marginTop: 64, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <Paper elevation={3} sx={{ p: 4, width: '100%' }}>
          <Typography component="h1" variant="h4" align="center" gutterBottom>
            {t('auth.register.title')}
          </Typography>

          <Stepper activeStep={activeStep} sx={{ pt: 3, pb: 5 }}>
            {steps.map((label) => (
              <Step key={label}>
                <StepLabel>{label}</StepLabel>
              </Step>
            ))}
          </Stepper>

          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}

          {activeStep === 0 ? (
            <form onSubmit={handleSendCode}>
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

              <Button
                type="submit"
                fullWidth
                variant="contained"
                size="large"
                sx={{ mt: 3, mb: 2 }}
                disabled={loading}
              >
                {loading ? <CircularProgress size={24} /> : t('auth.register.sendCode')}
              </Button>

              <div style={{ textAlign: 'center', marginTop: 16 }}>
                <Typography variant="body2" color="text.secondary">
                  {t('auth.register.haveAccount')}{' '}
                  <Link to="/login" style={{ color: '#1976d2', textDecoration: 'none' }}>
                    {t('auth.login.signIn')}
                  </Link>
                </Typography>
              </div>
            </form>
          ) : (
            <form onSubmit={handleVerifyAndRegister}>
              <Alert severity="info" sx={{ mb: 2 }}>
                {t('auth.register.verifyInfo')} {email}
              </Alert>

              <TextField
                margin="normal"
                required
                fullWidth
                id="code"
                label={t('auth.register.code')}
                name="code"
                autoFocus
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\s+/g, ''))}
                inputProps={{ maxLength: 64 }}
                disabled={loading}
                sx={fieldSx}
              />

              <TextField
                margin="normal"
                required
                fullWidth
                id="displayName"
                label={t('auth.register.displayName')}
                name="displayName"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                disabled={loading}
                sx={fieldSx}
              />

              <TextField
                margin="normal"
                required
                fullWidth
                name="password"
                label={t('auth.register.password')}
                type="password"
                id="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
                helperText={t('auth.register.passwordHint')}
                sx={fieldSx}
              />

              <TextField
                margin="normal"
                required
                fullWidth
                name="confirmPassword"
                label={t('auth.register.confirmPassword')}
                type="password"
                id="confirmPassword"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                disabled={loading}
                sx={fieldSx}
              />

              <Button
                type="submit"
                fullWidth
                variant="contained"
                size="large"
                sx={{ mt: 3, mb: 2 }}
                disabled={loading}
              >
                {loading ? <CircularProgress size={24} /> : t('auth.register.create')}
              </Button>

              <Button
                fullWidth
                variant="outlined"
                onClick={() => setActiveStep(0)}
                disabled={loading}
              >
                {t('auth.register.changeEmail')}
              </Button>
            </form>
          )}
        </Paper>
      </div>
    </Container>
  );
};
