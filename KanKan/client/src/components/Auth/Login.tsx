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

export const Login: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('12345678');
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
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
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const quickLogin = async (quickEmail: string) => {
    setError('');
    setLoading(true);
    try {
      const response = await authService.login({ email: quickEmail, password: '12345678' });
      authService.saveAuth(response.accessToken, response.user);
      dispatch(setAuth(response));
      navigate('/chats');
    } catch (err: any) {
      setError(err.message || 'Login failed');
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

  return (
    <Container component="main" maxWidth="xs">
      <div style={containerStyle}>
        <Paper elevation={3} sx={{ p: 4, width: '100%' }}>
          <Typography component="h1" variant="h4" align="center" gutterBottom>
            Welcome Back
          </Typography>

          <Typography variant="body2" color="text.secondary" align="center" sx={{ mb: 3 }}>
            Sign in to continue to KanKan
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
              label="Email Address"
              name="email"
              autoComplete="email"
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
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
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
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
                label="Remember me"
              />
              <Link
                to="/forgot-password"
                style={{
                  color: '#1976d2',
                  textDecoration: 'none',
                  fontSize: '0.875rem',
                }}
              >
                Forgot password?
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
              {loading ? <CircularProgress size={24} /> : 'Sign In'}
            </Button>

            <Divider sx={{ my: 2 }}>
              <Typography variant="body2" color="text.secondary">
                OR
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
                Don't have an account?{' '}
                <Link to="/register" style={{ color: '#1976d2', textDecoration: 'none', fontWeight: 500 }}>
                  Create one
                </Link>
              </Typography>
            </div>
          </form>
        </Paper>
      </div>
    </Container>
  );
};
