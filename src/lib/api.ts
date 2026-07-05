/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  Transaction,
  User,
  Wallet,
  Category,
  AuditLog,
  SystemSettings,
  TransactionType
} from '../types';

const TOKEN_KEY = 'ems_auth_token';
const USER_KEY = 'ems_auth_user';
const ACCOUNT_KEY = 'ems_active_account';

export class ApiClient {
  private static getHeaders(): HeadersInit {
    const token = localStorage.getItem(TOKEN_KEY);
    return {
      'Content-Type': 'application/json',
      Authorization: token ? `Bearer ${token}` : '',
    };
  }

  static getActiveAccount(): 'personal' | 'professional' {
    return (localStorage.getItem(ACCOUNT_KEY) as 'personal' | 'professional') || 'personal';
  }

  static setActiveAccount(account: 'personal' | 'professional') {
    localStorage.setItem(ACCOUNT_KEY, account);
  }

  static setAuth(token: string, user: Omit<User, 'passwordHash'>) {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  }

  static clearAuth() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem(ACCOUNT_KEY);
  }

  static getSavedUser(): Omit<User, 'passwordHash'> | null {
    const userStr = localStorage.getItem(USER_KEY);
    if (!userStr) return null;
    try {
      return JSON.parse(userStr);
    } catch {
      return null;
    }
  }

  private static async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const url = `${path}`;
    const headers = { ...this.getHeaders(), ...options.headers };
    
    const response = await fetch(url, { ...options, headers });
    
    if (!response.ok) {
      let message = 'An error occurred';
      try {
        const errorData = await response.json();
        message = errorData.error || message;
      } catch {
        // Fallback
      }
      if (response.status === 401) {
        this.clearAuth();
        // Redirect to login if on client
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new Event('auth_session_expired'));
        }
      }
      throw new Error(message);
    }

    return response.json() as Promise<T>;
  }

  // Auth Operations
  static async login(email: string, password: string): Promise<{ token: string; user: Omit<User, 'passwordHash'> }> {
    const data = await this.request<{ token: string; user: Omit<User, 'passwordHash'> }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    this.setAuth(data.token, data.user);
    return data;
  }

  static async logout(): Promise<void> {
    try {
      await this.request<void>('/api/auth/logout', { method: 'POST' });
    } finally {
      this.clearAuth();
    }
  }

  static async getMe(): Promise<Omit<User, 'passwordHash'>> {
    return this.request<Omit<User, 'passwordHash'>>('/api/auth/me');
  }

  // Dashboard Stats
  static async getDashboardStats(accountId: 'personal' | 'professional'): Promise<any> {
    return this.request<any>(`/api/dashboard?accountId=${accountId}`);
  }

  static async getAdminDashboardStats(): Promise<any> {
    return this.request<any>('/api/admin/dashboard');
  }

  // Wallets & Categories
  static async getWallets(accountId: 'personal' | 'professional'): Promise<Wallet[]> {
    return this.request<Wallet[]>(`/api/wallets?accountId=${accountId}`);
  }

  static async getCategories(accountId: 'personal' | 'professional'): Promise<Category[]> {
    return this.request<Category[]>(`/api/categories?accountId=${accountId}`);
  }

  // Transactions CRUD
  static async getTransactions(
    accountId: 'personal' | 'professional',
    filters: {
      search?: string;
      category?: string;
      wallet?: string;
      type?: TransactionType;
      startDate?: string;
      endDate?: string;
    } = {}
  ): Promise<Transaction[]> {
    let query = `accountId=${accountId}`;
    if (filters.search) query += `&search=${encodeURIComponent(filters.search)}`;
    if (filters.category) query += `&category=${filters.category}`;
    if (filters.wallet) query += `&wallet=${filters.wallet}`;
    if (filters.type) query += `&type=${filters.type}`;
    if (filters.startDate) query += `&startDate=${filters.startDate}`;
    if (filters.endDate) query += `&endDate=${filters.endDate}`;

    return this.request<Transaction[]>(`/api/transactions?${query}`);
  }

  static async createTransaction(tx: {
    accountId: 'personal' | 'professional';
    type: TransactionType;
    date: string;
    categoryId: string;
    walletId: string;
    amount: number;
    notes: string;
  }): Promise<Transaction> {
    return this.request<Transaction>('/api/transactions', {
      method: 'POST',
      body: JSON.stringify(tx),
    });
  }

  static async updateTransaction(
    id: string,
    tx: {
      date: string;
      categoryId: string;
      walletId: string;
      amount: number;
      notes: string;
    }
  ): Promise<Transaction> {
    return this.request<Transaction>(`/api/transactions/${id}`, {
      method: 'PUT',
      body: JSON.stringify(tx),
    });
  }

  static async deleteTransaction(id: string): Promise<void> {
    await this.request<void>(`/api/transactions/${id}`, {
      method: 'DELETE',
    });
  }

  // Transfers
  static async getTransferTargets(): Promise<any[]> {
    return this.request<any[]>('/api/users/transfer-targets');
  }

  static async createSelfTransfer(data: {
    accountId: 'personal' | 'professional';
    sourceWalletId: string;
    destWalletId: string;
    amount: number;
    date: string;
    notes: string;
  }): Promise<any> {
    return this.request<any>('/api/transactions/self-transfer', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  static async createUserTransfer(data: {
    sourceAccountId: 'personal' | 'professional';
    sourceWalletId: string;
    destUserId: string;
    destAccountId: 'personal' | 'professional';
    destWalletId: string;
    amount: number;
    date: string;
    notes: string;
  }): Promise<any> {
    return this.request<any>('/api/transactions/user-transfer', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  // Admin User CRUD
  static async getAdminUsers(): Promise<Omit<User, 'passwordHash'>[]> {
    return this.request<Omit<User, 'passwordHash'>[]>('/api/admin/users');
  }

  static async createAdminUser(user: Partial<User> & { password?: string }): Promise<User> {
    return this.request<User>('/api/admin/users', {
      method: 'POST',
      body: JSON.stringify(user),
    });
  }

  static async updateAdminUser(id: string, updates: Partial<User>): Promise<void> {
    await this.request<void>(`/api/admin/users/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  }

  static async deleteAdminUser(id: string): Promise<void> {
    await this.request<void>(`/api/admin/users/${id}`, {
      method: 'DELETE',
    });
  }

  static async factoryReset(): Promise<void> {
    await this.request<void>('/api/admin/factory-reset', {
      method: 'POST',
    });
  }

  static async resetUserPassword(id: string, newPasswordPlain: string): Promise<void> {
    await this.request<void>(`/api/admin/users/${id}/reset-password`, {
      method: 'POST',
      body: JSON.stringify({ password: newPasswordPlain }),
    });
  }

  // Admin Wallets & Categories Management
  static async getAdminUserWallets(userId: string, accountId: 'personal' | 'professional'): Promise<Wallet[]> {
    return this.request<Wallet[]>(`/api/admin/users/${userId}/wallets?accountId=${accountId}`);
  }

  static async addAdminUserWallet(userId: string, wallet: { name: string; isDefault: boolean; accountId: 'personal' | 'professional' }): Promise<Wallet> {
    return this.request<Wallet>(`/api/admin/users/${userId}/wallets`, {
      method: 'POST',
      body: JSON.stringify(wallet)
    });
  }

  static async updateAdminUserWallet(userId: string, walletId: string, wallet: { name: string; isDefault: boolean }): Promise<void> {
    await this.request<void>(`/api/admin/users/${userId}/wallets/${walletId}`, {
      method: 'PUT',
      body: JSON.stringify(wallet)
    });
  }

  static async deleteAdminUserWallet(userId: string, walletId: string): Promise<void> {
    await this.request<void>(`/api/admin/users/${userId}/wallets/${walletId}`, {
      method: 'DELETE'
    });
  }

  static async getAdminUserCategories(userId: string, accountId: 'personal' | 'professional'): Promise<Category[]> {
    return this.request<Category[]>(`/api/admin/users/${userId}/categories?accountId=${accountId}`);
  }

  static async addAdminUserCategory(userId: string, category: { name: string; type: TransactionType; accountId: 'personal' | 'professional' }): Promise<Category> {
    return this.request<Category>(`/api/admin/users/${userId}/categories`, {
      method: 'POST',
      body: JSON.stringify(category)
    });
  }

  static async updateAdminUserCategory(userId: string, categoryId: string, category: { name: string }): Promise<void> {
    await this.request<void>(`/api/admin/users/${userId}/categories/${categoryId}`, {
      method: 'PUT',
      body: JSON.stringify(category)
    });
  }

  static async deleteAdminUserCategory(userId: string, categoryId: string): Promise<void> {
    await this.request<void>(`/api/admin/users/${userId}/categories/${categoryId}`, {
      method: 'DELETE'
    });
  }

  // Admin Recycle Bin / Restore
  static async getDeletedTransactions(): Promise<(Transaction & { userEmail: string; categoryName: string; walletName: string })[]> {
    return this.request<(Transaction & { userEmail: string; categoryName: string; walletName: string })[]>('/api/admin/deleted-transactions');
  }

  static async restoreTransaction(id: string): Promise<void> {
    await this.request<void>(`/api/admin/restore-transaction/${id}`, {
      method: 'POST',
    });
  }

  // Admin System Logs & Settings
  static async getAuditLogs(): Promise<AuditLog[]> {
    return this.request<AuditLog[]>('/api/admin/audit-logs');
  }

  static async getSystemSettings(): Promise<SystemSettings> {
    return this.request<SystemSettings>('/api/admin/settings');
  }

  static async updateSystemSettings(settings: SystemSettings): Promise<void> {
    await this.request<void>('/api/admin/settings', {
      method: 'PUT',
      body: JSON.stringify(settings),
    });
  }
}
