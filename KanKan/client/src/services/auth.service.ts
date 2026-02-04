import axios, { AxiosError } from 'axios';
import type {
  RegisterRequest,
  VerifyEmailRequest,
  LoginRequest,
  AuthResponse,
  ForgotPasswordRequest,
  ResetPasswordRequest,
  User,
  ApiError,
} from '@/types';

const API_URL = import.meta.env.VITE_API_URL || '/api';

class AuthService {
  async register(data: RegisterRequest): Promise<{ message: string; email: string }> {
    try {
      const response = await axios.post(`${API_URL}/auth/register`, data);
      return response.data;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  async verifyEmail(data: VerifyEmailRequest): Promise<AuthResponse> {
    try {
      const response = await axios.post<AuthResponse>(
        `${API_URL}/auth/verify-email`,
        data,
        { withCredentials: true }
      );
      return response.data;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  async login(data: LoginRequest): Promise<AuthResponse> {
    try {
      const response = await axios.post<AuthResponse>(
        `${API_URL}/auth/login`,
        data,
        { withCredentials: true }
      );
      return response.data;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  async logout(): Promise<void> {
    try {
      const token = this.getAccessToken();
      await axios.post(
        `${API_URL}/auth/logout`,
        {},
        {
          headers: { Authorization: `Bearer ${token}` },
          withCredentials: true,
        }
      );
      this.clearAuth();
    } catch (error) {
      throw this.handleError(error);
    }
  }

  async refreshToken(): Promise<string> {
    try {
      const response = await axios.post<{ accessToken: string }>(
        `${API_URL}/auth/refresh-token`,
        {},
        { withCredentials: true }
      );
      const { accessToken } = response.data;
      localStorage.setItem('accessToken', accessToken);
      return accessToken;
    } catch (error) {
      this.clearAuth();
      throw this.handleError(error);
    }
  }

  async forgotPassword(data: ForgotPasswordRequest): Promise<{ message: string }> {
    try {
      const response = await axios.post(`${API_URL}/auth/forgot-password`, data);
      return response.data;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  async resetPassword(data: ResetPasswordRequest): Promise<{ message: string }> {
    try {
      const response = await axios.post(`${API_URL}/auth/reset-password`, data);
      return response.data;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  getCurrentUser(): User | null {
    const userStr = localStorage.getItem('user');
    return userStr ? JSON.parse(userStr) : null;
  }

  getAccessToken(): string | null {
    return localStorage.getItem('accessToken');
  }

  isAuthenticated(): boolean {
    return !!this.getAccessToken();
  }

  saveAuth(accessToken: string, user: User): void {
    localStorage.setItem('accessToken', accessToken);
    localStorage.setItem('user', JSON.stringify(user));
  }

  clearAuth(): void {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('user');
  }

  private handleError(error: unknown): ApiError {
    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError<ApiError>;
      if (axiosError.response) {
        return {
          message: axiosError.response.data.message || 'An error occurred',
          statusCode: axiosError.response.status,
          errors: axiosError.response.data.errors,
        };
      }
    }
    return {
      message: 'Network error. Please try again.',
      statusCode: 0,
    };
  }
}

export const authService = new AuthService();
