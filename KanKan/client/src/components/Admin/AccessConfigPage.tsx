import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Container,
  IconButton,
  InputBase,
  Paper,
  Typography,
} from '@mui/material';
import { Add as AddIcon, Delete as DeleteIcon, Refresh as RefreshIcon, Save as SaveIcon } from '@mui/icons-material';
import { Navigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { AppHeader } from '@/components/Shared/AppHeader';
import { useLanguage } from '@/i18n/LanguageContext';
import {
  AccessConfig,
  AccessConfigResponse,
  AdminUserAccessConfig,
  adminService,
  DomainVisibilityPreview,
  DomainVisibilityRuleConfig,
  FamilyTreeDomainPermission,
  FamilyTreeUserPermission,
  FamilyTreeManagerAccessConfig,
  FeatureDomainAccessConfig,
} from '@/services/admin.service';

const BoxAny = Box as any;

const emptyConfig: AccessConfig = {
  domainVisibilityRules: [],
  featureDomainAccess: [],
  adminUsers: [],
  familyTreeManagers: [],
};

const joinValues = (values: string[]) => values.length > 0 ? values.join(', ') : '-';
const normalizeEmail = (email: string) => email.trim().toLowerCase();

const inlineInputSx = {
  px: 0.75,
  py: 0.35,
  width: '100%',
  fontSize: 13,
  lineHeight: 1.35,
  borderRadius: '8px',
  backgroundColor: '#ffffff',
  boxShadow: 'inset 0 0 0 1px #d1d5db',
  '& input': {
    padding: 0,
  },
};

const configSurfaceSx = {
  overflowX: 'auto',
  overflowY: 'hidden',
  borderRadius: '8px',
  width: 'fit-content',
  maxWidth: '100%',
  mx: 'auto',
  backgroundColor: '#ffffff',
  borderColor: '#d1d5db',
  backgroundImage: 'none',
};

const configGridSurfaceWidth = 512;

const sectionSx = {
  width: '100%',
  maxWidth: 980,
  display: 'grid',
  justifyItems: 'center',
};

const sectionTitleSx = {
  width: '100%',
  maxWidth: configGridSurfaceWidth,
  fontSize: '0.95rem',
  fontWeight: 700,
  mb: 0.75,
};

const columnWidths = {
  primaryValue: '154px',
  secondaryValue: '286px',
  action: '36px',
};

const readOnlyValueSx = {
  minHeight: 24,
  width: '100%',
  px: 0,
  py: 0.35,
  fontSize: 13,
  lineHeight: 1.35,
  color: '#0f172a',
  wordBreak: 'break-word',
};

const adminConfigShellSx = {
  width: '100%',
  maxWidth: 980,
  mx: 'auto',
};

export const AccessConfigPage: React.FC = () => {
  const user = useSelector((state: any) => state.auth?.user);
  const { t } = useLanguage();
  const [response, setResponse] = useState<AccessConfigResponse | null>(null);
  const [config, setConfig] = useState<AccessConfig>(emptyConfig);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canManageAdmins = (user?.email ?? '').trim().toLowerCase() === 'kankan@kankan';
  const canManageGlobalAccess = canManageAdmins;
  const canManageFamilySettings = !canManageGlobalAccess;
  const pageShellSx = {
    ...adminConfigShellSx,
    maxWidth: canManageGlobalAccess ? configGridSurfaceWidth : adminConfigShellSx.maxWidth,
  };

  if (!user?.isAdmin) {
    return <Navigate to="/chats" replace />;
  }

  const loadConfig = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await adminService.getAccessConfig();
      setResponse(data);
      setConfig(data.config);
    } catch {
      setError(t('admin.config.loadFailed'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadConfig();
  }, []);

  const saveConfig = async () => {
    setSaving(true);
    setError(null);
    try {
      const data = await adminService.saveAccessConfig({
        ...config,
        domainVisibilityRules: config.domainVisibilityRules.map((row) => ({ ...row, enabled: true })),
        featureDomainAccess: config.featureDomainAccess.map((row) => ({ ...row, feature: 'familytree', enabled: true })),
        adminUsers: config.adminUsers.map((row) => ({ ...row, enabled: true })),
        familyTreeManagers: config.familyTreeManagers.map((row) => ({ ...row, enabled: true })),
      });
      setResponse(data);
      setConfig(data.config);
    } catch {
      setError(t('admin.config.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const visibilityRows = useMemo(() => response?.domainVisibilityPreview ?? [], [response]);
  const userExistsByEmail = useMemo(() => {
    const result = new Map<string, boolean>();
    for (const row of response?.familyTreeUsers ?? []) {
      result.set(normalizeEmail(row.email), row.userExists);
    }
    return result;
  }, [response]);
  const actionButtons = (
    <BoxAny sx={{ display: 'flex', gap: 0.75, flexShrink: 0 }}>
      <Button size="small" startIcon={<RefreshIcon />} onClick={loadConfig} disabled={loading || saving}>
        {t('admin.refresh')}
      </Button>
      <Button size="small" variant="contained" startIcon={<SaveIcon />} onClick={saveConfig} disabled={loading || saving}>
        {saving ? t('admin.config.saving') : t('admin.config.save')}
      </Button>
    </BoxAny>
  );

  return (
    <BoxAny sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', bgcolor: '#f7f8fa' }}>
      <AppHeader />
      <Container sx={{ py: 3, pt: 10 }} maxWidth="xl">
        <BoxAny sx={{ ...pageShellSx, display: 'flex', justifyContent: 'center', alignItems: 'flex-start', gap: 2, mb: 2 }}>
          <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 620, mx: 'auto', textAlign: 'center' }}>{t('admin.config.subtitle')}</Typography>
        </BoxAny>

        {error && <Alert severity="error" sx={{ ...pageShellSx, mb: 2 }}>{error}</Alert>}
        {response?.warnings.map((warning, index) => (
          <Alert key={`${warning}-${index}`} severity="warning" sx={{ ...pageShellSx, mb: 1 }}>{warning}</Alert>
        ))}

        {loading ? (
          <BoxAny sx={{ display: 'flex', justifyContent: 'center', p: 5 }}><CircularProgress /></BoxAny>
        ) : (
          <BoxAny sx={{ ...pageShellSx, display: 'grid', gap: 1.5 }}>
            {canManageGlobalAccess && (
              <BoxAny sx={{ display: 'grid', gap: 1.25 }}>
                <Section title={t('admin.config.domainVisibility')} actions={actionButtons}>
                  <EditableDomainVisibility config={config} setConfig={setConfig} />
                </Section>

                <Section title={t('admin.config.visibilityPreview')}>
                  <VisibilityPreviewGrid rows={visibilityRows} />
                </Section>

                <Section title={t('admin.config.familyDomains')}>
                  <EditableFeatureDomains config={config} setConfig={setConfig} />
                </Section>

                <Section title={t('admin.config.adminUsers')}>
                  <EditableAdminUsers config={config} setConfig={setConfig} userExistsByEmail={userExistsByEmail} />
                </Section>

                <Section title={t('admin.config.familyManagers')}>
                  <EditableFamilyManagers config={config} setConfig={setConfig} userExistsByEmail={userExistsByEmail} />
                </Section>
              </BoxAny>
            )}

            {canManageFamilySettings && (
            <BoxAny sx={{ display: 'grid', gap: 1.5 }}>
            <Section title={t('admin.config.familyManagers')} actions={actionButtons}>
              <EditableFamilyManagers config={config} setConfig={setConfig} userExistsByEmail={userExistsByEmail} />
            </Section>

            <Section title={t('admin.config.effectiveDomains')}>
              <EffectiveDomainsGrid rows={response?.familyTreeDomains ?? []} userExistsByEmail={userExistsByEmail} />
            </Section>

            <Section title={t('admin.config.effectiveUsers')}>
              <EffectiveUsersGrid rows={response?.familyTreeUsers ?? []} />
            </Section>
            </BoxAny>
            )}
          </BoxAny>
        )}
      </Container>
    </BoxAny>
  );
};

const Section: React.FC<{ title: string; children: React.ReactNode; actions?: React.ReactNode; titleMaxWidth?: number }> = ({ title, children, actions, titleMaxWidth = configGridSurfaceWidth }) => (
  <BoxAny sx={sectionSx}>
    <BoxAny sx={{ ...sectionTitleSx, maxWidth: titleMaxWidth, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
      <Typography variant="h6" sx={{ fontSize: '0.95rem', fontWeight: 700 }}>{title}</Typography>
      {actions}
    </BoxAny>
    {children}
  </BoxAny>
);

const EditableFeatureDomains: React.FC<{ config: AccessConfig; setConfig: React.Dispatch<React.SetStateAction<AccessConfig>> }> = ({ config, setConfig }) => (
  <FeatureDomainsEditor config={config} setConfig={setConfig} />
);

const FeatureDomainsEditor: React.FC<{ config: AccessConfig; setConfig: React.Dispatch<React.SetStateAction<AccessConfig>> }> = ({ config, setConfig }) => {
  const { t } = useLanguage();
  const [draftRows, setDraftRows] = useState<Set<number>>(new Set());
  const addRow = () => {
    const draftIndex = config.featureDomainAccess.length;
    setDraftRows((prev) => new Set(prev).add(draftIndex));
    setConfig((prev) => ({ ...prev, featureDomainAccess: [...prev.featureDomainAccess, { feature: 'familytree', domain: '', enabled: true }] }));
  };
  const removeRow = (index: number) => {
    setDraftRows((prev) => new Set([...prev].filter((rowIndex) => rowIndex !== index).map((rowIndex) => rowIndex > index ? rowIndex - 1 : rowIndex)));
    setConfig((prev) => ({ ...prev, featureDomainAccess: prev.featureDomainAccess.filter((_, i) => i !== index) }));
  };

  return (
    <EditableList<FeatureDomainAccessConfig>
      columns={[
        { label: t('admin.config.domain'), width: columnWidths.primaryValue },
        { label: '', width: columnWidths.secondaryValue },
      ]}
      rows={config.featureDomainAccess}
      addRow={addRow}
      removeRow={removeRow}
      renderCells={(row, index) => [
        row.domain && !draftRows.has(index)
          ? <ReadOnlyValue value={row.domain} />
          : <InputBase value={row.domain} onChange={(e) => setConfig((prev) => ({ ...prev, featureDomainAccess: prev.featureDomainAccess.map((item, i) => i === index ? { ...item, domain: e.target.value } : item) }))} fullWidth sx={inlineInputSx} />,
        <BoxAny />,
      ]}
    />
  );
};

const EditableAdminUsers: React.FC<{
  config: AccessConfig;
  setConfig: React.Dispatch<React.SetStateAction<AccessConfig>>;
  userExistsByEmail: Map<string, boolean>;
}> = ({ config, setConfig, userExistsByEmail }) => (
  <AdminUsersEditor config={config} setConfig={setConfig} userExistsByEmail={userExistsByEmail} />
);

const AdminUsersEditor: React.FC<{
  config: AccessConfig;
  setConfig: React.Dispatch<React.SetStateAction<AccessConfig>>;
  userExistsByEmail: Map<string, boolean>;
}> = ({ config, setConfig, userExistsByEmail }) => {
  const { t } = useLanguage();
  const [draftRows, setDraftRows] = useState<Set<number>>(new Set());
  const addRow = () => {
    const draftIndex = config.adminUsers.length;
    setDraftRows((prev) => new Set(prev).add(draftIndex));
    setConfig((prev) => ({ ...prev, adminUsers: [...prev.adminUsers, { email: '', enabled: true }] }));
  };
  const removeRow = (index: number) => {
    setDraftRows((prev) => new Set([...prev].filter((rowIndex) => rowIndex !== index).map((rowIndex) => rowIndex > index ? rowIndex - 1 : rowIndex)));
    setConfig((prev) => ({ ...prev, adminUsers: prev.adminUsers.filter((_, i) => i !== index) }));
  };

  return (
    <EditableList<AdminUserAccessConfig>
      columns={[
        { label: t('admin.email'), width: columnWidths.primaryValue },
        { label: '', width: columnWidths.secondaryValue },
      ]}
      rows={config.adminUsers}
      addRow={addRow}
      removeRow={removeRow}
      renderCells={(row, index) => [
        row.email && !draftRows.has(index)
          ? <ReadOnlyValue value={row.email} monospace={row.email.includes('@')} missing={userExistsByEmail.get(normalizeEmail(row.email)) === false} />
          : <InputBase value={row.email} onChange={(e) => setConfig((prev) => ({ ...prev, adminUsers: prev.adminUsers.map((item, i) => i === index ? { ...item, email: e.target.value } : item) }))} fullWidth sx={{ ...inlineInputSx, fontFamily: 'monospace' }} />,
        <BoxAny />,
      ]}
    />
  );
};

const EditableFamilyManagers: React.FC<{
  config: AccessConfig;
  setConfig: React.Dispatch<React.SetStateAction<AccessConfig>>;
  userExistsByEmail: Map<string, boolean>;
}> = ({ config, setConfig, userExistsByEmail }) => (
  <FamilyManagersEditor config={config} setConfig={setConfig} userExistsByEmail={userExistsByEmail} />
);

const FamilyManagersEditor: React.FC<{
  config: AccessConfig;
  setConfig: React.Dispatch<React.SetStateAction<AccessConfig>>;
  userExistsByEmail: Map<string, boolean>;
}> = ({ config, setConfig, userExistsByEmail }) => {
  const { t } = useLanguage();
  const [draftRows, setDraftRows] = useState<Set<number>>(new Set());
  const addRow = () => {
    const draftIndex = config.familyTreeManagers.length;
    setDraftRows((prev) => new Set(prev).add(draftIndex));
    setConfig((prev) => ({ ...prev, familyTreeManagers: [...prev.familyTreeManagers, { adminEmail: '', domain: '', enabled: true }] }));
  };
  const removeRow = (index: number) => {
    setDraftRows((prev) => new Set([...prev].filter((rowIndex) => rowIndex !== index).map((rowIndex) => rowIndex > index ? rowIndex - 1 : rowIndex)));
    setConfig((prev) => ({ ...prev, familyTreeManagers: prev.familyTreeManagers.filter((_, i) => i !== index) }));
  };

  return (
    <EditableList<FamilyTreeManagerAccessConfig>
      columns={[
        { label: t('admin.config.adminEmail'), width: columnWidths.primaryValue },
        { label: t('admin.config.managedDomain'), width: columnWidths.secondaryValue },
      ]}
      rows={config.familyTreeManagers}
      addRow={addRow}
      removeRow={removeRow}
      renderCells={(row, index) => [
        row.adminEmail && row.domain && !draftRows.has(index)
          ? <ReadOnlyValue value={row.adminEmail} monospace={row.adminEmail.includes('@')} missing={userExistsByEmail.get(normalizeEmail(row.adminEmail)) === false} />
          : <InputBase value={row.adminEmail} onChange={(e) => setConfig((prev) => ({ ...prev, familyTreeManagers: prev.familyTreeManagers.map((item, i) => i === index ? { ...item, adminEmail: e.target.value } : item) }))} fullWidth sx={{ ...inlineInputSx, fontFamily: 'monospace' }} />,
        row.adminEmail && row.domain && !draftRows.has(index)
          ? <ReadOnlyValue value={row.domain} />
          : <InputBase value={row.domain} onChange={(e) => setConfig((prev) => ({ ...prev, familyTreeManagers: prev.familyTreeManagers.map((item, i) => i === index ? { ...item, domain: e.target.value } : item) }))} fullWidth sx={inlineInputSx} />,
      ]}
    />
  );
};

const EditableDomainVisibility: React.FC<{ config: AccessConfig; setConfig: React.Dispatch<React.SetStateAction<AccessConfig>> }> = ({ config, setConfig }) => (
  <DomainVisibilityEditor config={config} setConfig={setConfig} />
);

const DomainVisibilityEditor: React.FC<{ config: AccessConfig; setConfig: React.Dispatch<React.SetStateAction<AccessConfig>> }> = ({ config, setConfig }) => {
  const { t } = useLanguage();
  const [draftRows, setDraftRows] = useState<Set<number>>(new Set());
  const addRow = () => {
    const draftIndex = config.domainVisibilityRules.length;
    setDraftRows((prev) => new Set(prev).add(draftIndex));
    setConfig((prev) => ({ ...prev, domainVisibilityRules: [...prev.domainVisibilityRules, { sourceDomain: '', targetDomain: '', enabled: true }] }));
  };
  const removeRow = (index: number) => {
    setDraftRows((prev) => new Set([...prev].filter((rowIndex) => rowIndex !== index).map((rowIndex) => rowIndex > index ? rowIndex - 1 : rowIndex)));
    setConfig((prev) => ({ ...prev, domainVisibilityRules: prev.domainVisibilityRules.filter((_, i) => i !== index) }));
  };

  return (
    <EditableList<DomainVisibilityRuleConfig>
      columns={[
        { label: t('admin.config.sourceDomain'), width: columnWidths.primaryValue },
        { label: t('admin.config.visibleDomain'), width: columnWidths.secondaryValue },
      ]}
      rows={config.domainVisibilityRules}
      addRow={addRow}
      removeRow={removeRow}
      renderCells={(row, index) => [
        row.sourceDomain && row.targetDomain && !draftRows.has(index)
          ? <ReadOnlyValue value={row.sourceDomain} />
          : <InputBase value={row.sourceDomain} onChange={(e) => setConfig((prev) => ({ ...prev, domainVisibilityRules: prev.domainVisibilityRules.map((item, i) => i === index ? { ...item, sourceDomain: e.target.value } : item) }))} fullWidth sx={inlineInputSx} />,
        row.sourceDomain && row.targetDomain && !draftRows.has(index)
          ? <ReadOnlyValue value={row.targetDomain} />
          : <InputBase value={row.targetDomain} onChange={(e) => setConfig((prev) => ({ ...prev, domainVisibilityRules: prev.domainVisibilityRules.map((item, i) => i === index ? { ...item, targetDomain: e.target.value } : item) }))} fullWidth sx={inlineInputSx} />,
      ]}
    />
  );
};

const ReadOnlyValue: React.FC<{ value: string; monospace?: boolean; missing?: boolean }> = ({ value, monospace, missing }) => (
  <Typography sx={{ ...readOnlyValueSx, fontFamily: monospace ? 'monospace' : 'inherit', color: missing ? '#92400e' : readOnlyValueSx.color }}>
    {value || '-'}
  </Typography>
);

const EmailList: React.FC<{ values: string[]; userExistsByEmail: Map<string, boolean> }> = ({ values, userExistsByEmail }) => {
  if (values.length === 0) return <>-</>;
  return (
    <BoxAny sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
      {values.map((value) => {
        const missing = userExistsByEmail.get(normalizeEmail(value)) === false;
        return (
          <Typography key={value} component="span" sx={{ fontSize: 13, fontFamily: value.includes('@') ? 'monospace' : 'inherit', color: missing ? '#92400e' : 'inherit' }}>
            {value}
          </Typography>
        );
      })}
    </BoxAny>
  );
};

const VisibilityPreviewGrid: React.FC<{ rows: DomainVisibilityPreview[] }> = ({ rows }) => {
  const { t } = useLanguage();
  const columns = [
    { label: t('admin.config.viewerDomain'), width: columnWidths.primaryValue },
    { label: t('admin.config.targetDomain'), width: columnWidths.secondaryValue },
    { label: t('admin.config.canSee'), width: columnWidths.action, align: 'center' as const },
  ];

  return (
    <Paper variant="outlined" sx={configSurfaceSx}>
      <BoxAny
        sx={{
          display: 'grid',
          gridTemplateColumns: columns.map(column => column.width).join(' '),
          columnGap: 1,
          px: 1.25,
          py: 0.75,
          alignItems: 'center',
          backgroundColor: '#f3f4f6',
          borderBottom: rows.length > 0 ? '1px solid #e5e7eb' : 'none',
        }}
      >
        {columns.map((column) => (
          <BoxAny key={column.label} sx={{ display: 'flex', justifyContent: column.align === 'center' ? 'center' : 'flex-start', minWidth: 0 }}>
            <Typography variant="caption" color="text.secondary" sx={{ fontSize: 11 }}>{column.label}</Typography>
          </BoxAny>
        ))}
      </BoxAny>

      <BoxAny sx={{ px: 1.25, py: 0.35 }}>
        {rows.length === 0 ? (
          <Typography variant="body2" color="text.secondary" sx={{ fontSize: 12, fontStyle: 'italic', py: 0.75 }}>
            <EmptyText />
          </Typography>
        ) : rows.map((row) => (
          <BoxAny
            key={`${row.viewerDomain}-${row.targetDomain}`}
            sx={{
              display: 'grid',
              gridTemplateColumns: columns.map(column => column.width).join(' '),
              columnGap: 1,
              py: 0.65,
              alignItems: 'center',
              borderBottom: row === rows[rows.length - 1] ? 'none' : '1px solid #e5e7eb',
            }}
          >
            <ReadOnlyValue value={row.viewerDomain} />
            <ReadOnlyValue value={row.targetDomain} />
            <Typography sx={{ ...readOnlyValueSx, textAlign: 'center' }}>
              {row.canSee ? t('common.yes') : t('common.no')}
            </Typography>
          </BoxAny>
        ))}
      </BoxAny>
    </Paper>
  );
};

const EffectiveDomainsGrid: React.FC<{
  rows: FamilyTreeDomainPermission[];
  userExistsByEmail: Map<string, boolean>;
}> = ({ rows, userExistsByEmail }) => {
  const { t } = useLanguage();
  const columns = [
    { label: t('admin.config.domain'), width: columnWidths.primaryValue },
    { label: t('admin.config.createManage'), width: columnWidths.secondaryValue },
    { label: t('admin.config.treeCount'), width: columnWidths.action, align: 'center' as const },
  ];

  return (
    <ReadOnlyGrid
      columns={columns}
      rows={rows}
      getKey={(row) => row.domain}
      renderCells={(row) => [
        <ReadOnlyValue value={row.domain} />,
        <EmailList values={row.canCreateManage} userExistsByEmail={userExistsByEmail} />,
        <Typography sx={{ ...readOnlyValueSx, textAlign: 'center' }}>{row.treeCount}</Typography>,
      ]}
    />
  );
};

const EffectiveUsersGrid: React.FC<{ rows: FamilyTreeUserPermission[] }> = ({ rows }) => {
  const { t } = useLanguage();
  const columns = [
    { label: t('admin.email'), width: columnWidths.primaryValue },
    { label: t('admin.config.editDomains'), width: columnWidths.secondaryValue },
    { label: t('admin.config.admin'), width: columnWidths.action, align: 'center' as const },
  ];

  return (
    <ReadOnlyGrid
      columns={columns}
      rows={rows}
      getKey={(row) => row.email}
      getRowSx={(row) => ({ backgroundColor: row.userExists ? 'inherit' : '#fffbeb' })}
      renderCells={(row) => [
        <ReadOnlyValue value={row.email} monospace={row.email.includes('@')} missing={!row.userExists} />,
        <ReadOnlyValue value={joinValues(row.canEditDomains)} />,
        <Typography sx={{ ...readOnlyValueSx, textAlign: 'center' }}>{row.isAdmin ? t('common.yes') : t('common.no')}</Typography>,
      ]}
    />
  );
};

const ReadOnlyGrid = <T,>({
  columns,
  rows,
  getKey,
  renderCells,
  getRowSx,
}: {
  columns: { label: string; width: string; align?: 'left' | 'center' }[];
  rows: T[];
  getKey: (row: T) => string;
  renderCells: (row: T) => React.ReactNode[];
  getRowSx?: (row: T) => object;
}) => (
  <Paper variant="outlined" sx={configSurfaceSx}>
    <BoxAny
      sx={{
        display: 'grid',
        gridTemplateColumns: columns.map(column => column.width).join(' '),
        columnGap: 1,
        px: 1.25,
        py: 0.75,
        alignItems: 'center',
        backgroundColor: '#f3f4f6',
        borderBottom: rows.length > 0 ? '1px solid #e5e7eb' : 'none',
      }}
    >
      {columns.map((column) => (
        <BoxAny key={column.label} sx={{ display: 'flex', justifyContent: column.align === 'center' ? 'center' : 'flex-start', minWidth: 0 }}>
          <Typography variant="caption" color="text.secondary" sx={{ fontSize: 11 }}>{column.label}</Typography>
        </BoxAny>
      ))}
    </BoxAny>

    <BoxAny sx={{ px: 1.25, py: 0.35 }}>
      {rows.length === 0 ? (
        <Typography variant="body2" color="text.secondary" sx={{ fontSize: 12, fontStyle: 'italic', py: 0.75 }}>
          <EmptyText />
        </Typography>
      ) : rows.map((row, index) => (
        <BoxAny
          key={getKey(row)}
          sx={{
            display: 'grid',
            gridTemplateColumns: columns.map(column => column.width).join(' '),
            columnGap: 1,
            py: 0.65,
            alignItems: 'center',
            borderBottom: index === rows.length - 1 ? 'none' : '1px solid #e5e7eb',
            ...(getRowSx?.(row) ?? {}),
          }}
        >
          {renderCells(row).map((cell, cellIndex) => (
            <BoxAny key={cellIndex} sx={{ minWidth: 0, display: 'flex', justifyContent: columns[cellIndex]?.align === 'center' ? 'center' : 'flex-start' }}>
              {cell}
            </BoxAny>
          ))}
        </BoxAny>
      ))}
    </BoxAny>
  </Paper>
);

const EditableList = <T,>({
  columns,
  rows,
  addRow,
  removeRow,
  renderCells,
  allowAdd = true,
  allowRemove = true,
}: {
  columns: { label: string; width: string; align?: 'left' | 'center' }[];
  rows: T[];
  addRow: () => void;
  removeRow: (index: number) => void;
  renderCells: (row: T, index: number) => React.ReactNode[];
  allowAdd?: boolean;
  allowRemove?: boolean;
}) => (
  <Paper variant="outlined" sx={configSurfaceSx}>
    <BoxAny
      sx={{
        display: 'grid',
        gridTemplateColumns: `${columns.map(column => column.width).join(' ')} ${columnWidths.action}`,
        columnGap: 1,
        px: 1.25,
        py: 0.75,
        alignItems: 'center',
        backgroundColor: '#f3f4f6',
        borderBottom: rows.length > 0 ? '1px solid #e5e7eb' : 'none',
      }}
    >
      {columns.map((column, index) => (
        <BoxAny key={column.label} sx={{ display: 'flex', alignItems: 'center', minWidth: 0, justifyContent: column.align === 'center' ? 'center' : 'flex-start' }}>
          <Typography variant="caption" color="text.secondary" sx={{ fontSize: 11 }}>{column.label}</Typography>
        </BoxAny>
      ))}
      <BoxAny sx={{ display: 'flex', justifyContent: 'center' }}>
        {allowAdd && (
          <IconButton size="small" onClick={addRow} aria-label="add" sx={{ width: 24, height: 24 }}>
            <AddIcon fontSize="small" />
          </IconButton>
        )}
      </BoxAny>
    </BoxAny>

    <BoxAny sx={{ px: 1.25, py: 0.35 }}>
      {rows.length === 0 ? (
        <Typography variant="body2" color="text.secondary" sx={{ fontSize: 12, fontStyle: 'italic', py: 0.75 }}>
          <EmptyText />
        </Typography>
      ) : rows.map((row, index) => (
        <BoxAny
          key={index}
          sx={{
            display: 'grid',
            gridTemplateColumns: `${columns.map(column => column.width).join(' ')} ${columnWidths.action}`,
            columnGap: 1,
            py: 0.65,
            alignItems: 'center',
            borderBottom: index === rows.length - 1 ? 'none' : '1px solid #e5e7eb',
          }}
        >
          {renderCells(row, index).map((cell, cellIndex) => (
            <BoxAny key={cellIndex} sx={{ minWidth: 0, display: 'flex', justifyContent: columns[cellIndex]?.align === 'center' ? 'center' : 'flex-start' }}>
              {cell}
            </BoxAny>
          ))}
          {allowRemove ? (
            <IconButton size="small" onClick={() => removeRow(index)} aria-label="delete" sx={{ width: 24, height: 24, justifySelf: 'center' }}>
              <DeleteIcon fontSize="small" />
            </IconButton>
          ) : <BoxAny sx={{ width: 24, height: 24 }} />}
        </BoxAny>
      ))}
    </BoxAny>
  </Paper>
);

const EmptyText: React.FC = () => {
  const { t } = useLanguage();
  return <>{t('admin.config.empty')}</>;
};