import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  Box,
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

const steps = ['Enter Email', 'Verify & Complete'];

export const Register: React.FC = () => {
  const [activeStep, setActiveStep] = useState(0);
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('12345678');
  const [confirmPassword, setConfirmPassword] = useState('12345678');
  const [displayName, setDisplayName] = useState('');
  const [error, setErrorState] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const dispatch = useDispatch();

  const handleSendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorState('');
    setLoading(true);

    try {
      await authService.register({ email });
      setActiveStep(1);
    } catch (err: any) {
      setErrorState(err.message || 'Failed to send verification code');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyAndRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorState('');

    // Validation
    if (password !== confirmPassword) {
      setErrorState('Passwords do not match');
      return;
    }

    if (password.length < 8) {
      setErrorState('Password must be at least 8 characters');
      return;
    }

    if (displayName.length < 2) {
      setErrorState('Display name must be at least 2 characters');
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
      setErrorState(err.message || 'Verification failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Container component="main" maxWidth="sm">
      <Box
        sx={{
          marginTop: 8,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
        }}
      >
        <Paper elevation={3} sx={{ p: 4, width: '100%' }}>
          <Typography component="h1" variant="h4" align="center" gutterBottom>
            Create Account
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
            <Box component="form" onSubmit={handleSendCode}>
              <TextField
                margin="normal"
                required
                fullWidth
                id="email"
                label="Email Address"
                name="email"
                autoComplete="email"
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                type="email"
                disabled={loading}
              />

              <Button
                type="submit"
                fullWidth
                variant="contained"
                size="large"
                sx={{ mt: 3, mb: 2 }}
                disabled={loading}
              >
                {loading ? <CircularProgress size={24} /> : 'Send Verification Code'}
              </Button>

              <Box sx={{ textAlign: 'center', mt: 2 }}>
                <Typography variant="body2" color="text.secondary">
                  Already have an account?{' '}
                  <Link to="/login" style={{ color: '#1976d2', textDecoration: 'none' }}>
                    Sign in
                  </Link>
                </Typography>
              </Box>
            </Box>
          ) : (
            <Box component="form" onSubmit={handleVerifyAndRegister}>
              <Alert severity="info" sx={{ mb: 2 }}>
                We sent a 6-digit code to {email}
              </Alert>

              <TextField
                margin="normal"
                required
                fullWidth
                id="code"
                label="Verification Code"
                name="code"
                autoFocus
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                inputProps={{ maxLength: 6, pattern: '[0-9]*' }}
                disabled={loading}
              />

              <TextField
                margin="normal"
                required
                fullWidth
                id="displayName"
                label="Display Name"
                name="displayName"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                disabled={loading}
              />

              <TextField
                margin="normal"
                required
                fullWidth
                name="password"
                label="Password"
                type="password"
                id="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
                helperText="Minimum 8 characters"
              />

              <TextField
                margin="normal"
                required
                fullWidth
                name="confirmPassword"
                label="Confirm Password"
                type="password"
                id="confirmPassword"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                disabled={loading}
              />

              <Button
                type="submit"
                fullWidth
                variant="contained"
                size="large"
                sx={{ mt: 3, mb: 2 }}
                disabled={loading}
              >
                {loading ? <CircularProgress size={24} /> : 'Create Account'}
              </Button>

              <Button
                fullWidth
                variant="outlined"
                onClick={() => setActiveStep(0)}
                disabled={loading}
              >
                Change Email
              </Button>
            </Box>
          )}
        </Paper>
      </Box>
    </Container>
  );
};
