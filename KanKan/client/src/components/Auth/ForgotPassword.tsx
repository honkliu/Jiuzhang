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
  Stepper,
  Step,
  StepLabel,
} from '@mui/material';
import { authService } from '@/services/auth.service';
import { useLanguage } from '@/i18n/LanguageContext';

export const ForgotPassword: React.FC = () => {
  const [activeStep, setActiveStep] = useState(0);
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [info, setInfo] = useState('');
  const { t } = useLanguage();
  const navigate = useNavigate();

  const steps = [t('auth.forgot.steps.email'), t('auth.forgot.steps.reset')];

  const handleSendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setInfo('');
    setLoading(true);

    try {
      const response = await authService.forgotPassword({ email });
      setInfo(response.message);
      setActiveStep(1);
    } catch (err: any) {
      setError(err.message || t('auth.forgot.sendFailed'));
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setInfo('');

    if (code.length !== 6) {
      setError(t('auth.forgot.codeRequired'));
      return;
    }

    if (newPassword.length < 8) {
      setError(t('auth.register.passwordLength'));
      return;
    }

    if (newPassword !== confirmPassword) {
      setError(t('auth.register.passwordMismatch'));
      return;
    }

    setLoading(true);

    try {
      const response = await authService.resetPassword({
        email,
        code,
        newPassword,
      });
      setInfo(response.message);
      navigate('/login');
    } catch (err: any) {
      setError(err.message || t('auth.forgot.resetFailed'));
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
            {t('auth.forgot.title')}
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

          {info && (
            <Alert severity="info" sx={{ mb: 2 }}>
              {info}
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
                {loading ? <CircularProgress size={24} /> : t('auth.forgot.send')}
              </Button>

              <div style={{ textAlign: 'center', marginTop: 16 }}>
                <Typography variant="body2" color="text.secondary">
                  {t('auth.forgot.remembered')}{' '}
                  <Link to="/login" style={{ color: '#1976d2', textDecoration: 'none' }}>
                    {t('auth.login.signIn')}
                  </Link>
                </Typography>
              </div>
            </form>
          ) : (
            <form onSubmit={handleResetPassword}>
              <Alert severity="info" sx={{ mb: 2 }}>
                {t('auth.forgot.verifyInfo')} {email}
              </Alert>

              <TextField
                margin="normal"
                required
                fullWidth
                id="code"
                label={t('auth.forgot.resetCode')}
                name="code"
                autoFocus
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                inputProps={{ maxLength: 6, pattern: '[0-9]*' }}
                disabled={loading}
                sx={fieldSx}
              />

              <TextField
                margin="normal"
                required
                fullWidth
                name="newPassword"
                label={t('auth.forgot.newPassword')}
                type="password"
                id="newPassword"
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                disabled={loading}
                helperText={t('auth.register.passwordHint')}
                sx={fieldSx}
              />

              <TextField
                margin="normal"
                required
                fullWidth
                name="confirmPassword"
                label={t('auth.forgot.confirmNewPassword')}
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
                {loading ? <CircularProgress size={24} /> : t('auth.forgot.reset')}
              </Button>

              <Button
                fullWidth
                variant="outlined"
                onClick={() => setActiveStep(0)}
                disabled={loading}
              >
                {t('auth.forgot.changeEmail')}
              </Button>
            </form>
          )}
        </Paper>
      </div>
    </Container>
  );
};
