import apiClient from '@/utils/api';
import { User } from '@/services/contact.service';

export interface DomainVisibilityRuleConfig {
  sourceDomain: string;
  targetDomain: string;
  enabled: boolean;
}

export interface FeatureDomainAccessConfig {
  feature: string;
  domain: string;
  enabled: boolean;
}

export interface AdminUserAccessConfig {
  email: string;
  enabled: boolean;
}

export interface FamilyTreeManagerAccessConfig {
  adminEmail: string;
  domain: string;
  enabled: boolean;
}

export interface AccessConfig {
  domainVisibilityRules: DomainVisibilityRuleConfig[];
  featureDomainAccess: FeatureDomainAccessConfig[];
  adminUsers: AdminUserAccessConfig[];
  familyTreeManagers: FamilyTreeManagerAccessConfig[];
}

export interface FamilyTreeDomainPermission {
  domain: string;
  featureEnabled: boolean;
  canCreateManage: string[];
  canViewByDefault: string;
  treeCount: number;
}

export interface FamilyTreeUserPermission {
  email: string;
  domain: string;
  userExists: boolean;
  isAdmin: boolean;
  ownDomainEnabled: boolean;
  managedDomains: string[];
  canViewDomains: string[];
  canEditDomains: string[];
}

export interface DomainVisibilityPreview {
  viewerDomain: string;
  targetDomain: string;
  canSee: boolean;
  reason: string;
}

export interface AccessConfigResponse {
  config: AccessConfig;
  familyTreeDomains: FamilyTreeDomainPermission[];
  familyTreeUsers: FamilyTreeUserPermission[];
  domainVisibilityPreview: DomainVisibilityPreview[];
  warnings: string[];
}

class AdminService {
  async getUsers(limit = 200): Promise<User[]> {
    const response = await apiClient.get<User[]>(`/admin/users?limit=${limit}`);
    return response.data;
  }

  async deleteUser(userId: string): Promise<{ message: string }> {
    const response = await apiClient.delete<{ message: string }>(`/admin/users/${userId}`);
    return response.data;
  }

  async disableUser(userId: string): Promise<{ message: string }> {
    const response = await apiClient.post<{ message: string }>(`/admin/users/${userId}/disable`);
    return response.data;
  }

  async enableUser(userId: string): Promise<{ message: string }> {
    const response = await apiClient.post<{ message: string }>(`/admin/users/${userId}/enable`);
    return response.data;
  }

  async getInviteCodes(): Promise<{ email: string; code: string; purpose: string; createdAt: string; status: string }[]> {
    const response = await apiClient.get<{ email: string; code: string; purpose: string; createdAt: string; status: string }[]>('/admin/invite-codes');
    return response.data;
  }

  async getAccessConfig(): Promise<AccessConfigResponse> {
    const response = await apiClient.get<AccessConfigResponse>('/admin/access-config');
    return response.data;
  }

  async saveAccessConfig(config: AccessConfig): Promise<AccessConfigResponse> {
    const response = await apiClient.put<AccessConfigResponse>('/admin/access-config', config);
    return response.data;
  }
}

export const adminService = new AdminService();
