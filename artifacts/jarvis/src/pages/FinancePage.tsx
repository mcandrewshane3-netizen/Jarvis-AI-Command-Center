import { useState } from 'react';
import { HolographicPanel, TechLabel, TechValue, Button, StatusDot } from '@/components/primitives';
import { Trash2, Landmark, Receipt } from 'lucide-react';
import { useFinanceSummary, useSpecialistRecords, useCreateSpecialistRecord, useDeleteSpecialistRecord } from '@/hooks/use-jarvis-api';

function parseUsdCents(value: string, signed = false): number | null {
  const pattern = signed ? /^-?\d+(?:\.\d{1,2})?$/ : /^\d+(?:\.\d{1,2})?$/;
  if (!pattern.test(value)) return null;
  const negative = value.startsWith('-');
  const normalized = negative ? value.slice(1) : value;
  const [dollars, fractional = ''] = normalized.split('.');
  const cents = Number(dollars) * 100 + Number(fractional.padEnd(2, '0'));
  if (!Number.isSafeInteger(cents)) return null;
  return negative ? -cents : cents;
}

function FinanceMetric({
  loading,
  cents,
  status,
  className = '',
}: {
  loading: boolean;
  cents?: number | null;
  status?: string;
  className?: string;
}) {
  if (loading) return <span className="animate-pulse text-muted-foreground">--</span>;
  if (status !== 'OK' || cents === undefined || cents === null) {
    return (
      <div>
        <TechValue size="md" className="text-muted-foreground">--</TechValue>
        <div className="mt-2 font-mono text-[9px] uppercase tracking-widest text-amber-500">Data required</div>
      </div>
    );
  }
  return (
    <TechValue size="md" className={className}>
      {'$' + (cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
    </TechValue>
  );
}

export function FinancePage() {
  const { data: summary, isLoading: loadingSummary } = useFinanceSummary();
  const { data: accounts, isLoading: loadingAccounts } = useSpecialistRecords('finance', 'FINANCIAL_ACCOUNT');
  const { data: bills, isLoading: loadingBills } = useSpecialistRecords('finance', 'RECURRING_BILL');

  const createRecord = useCreateSpecialistRecord('finance');
  const deleteRecord = useDeleteSpecialistRecord('finance');

  const [activeTab, setActiveTab] = useState<'ACCOUNTS' | 'BILLS'>('ACCOUNTS');
  const [formError, setFormError] = useState<string | null>(null);

  // Account form state
  const [accName, setAccName] = useState('');
  const [accType, setAccType] = useState('CHECKING');
  const [accBalance, setAccBalance] = useState('');

  // Bill form state
  const [billName, setBillName] = useState('');
  const [billAmount, setBillAmount] = useState('');
  const [billNextDate, setBillNextDate] = useState('');
  const [billFreq, setBillFreq] = useState('MONTHLY');

  const handleCreateAccount = (e: React.FormEvent) => {
    e.preventDefault();
    const balanceCents = parseUsdCents(accBalance, true);
    if (balanceCents === null) {
      setFormError('Balance must be a valid dollar amount with no more than two decimal places.');
      return;
    }
    setFormError(null);
    createRecord.mutate({
      recordType: 'FINANCIAL_ACCOUNT',
      title: accName,
      data: {
        name: accName,
        type: accType,
        currency: 'USD',
        balanceCents,
        balanceAsOf: new Date().toISOString().slice(0, 10)
      }
    }, {
      onSuccess: () => {
        setAccName('');
        setAccBalance('');
        setAccType('CHECKING');
      }
    });
  };

  const handleCreateBill = (e: React.FormEvent) => {
    e.preventDefault();
    const amountCents = parseUsdCents(billAmount);
    if (amountCents === null) {
      setFormError('Bill amount must be a non-negative dollar amount with no more than two decimal places.');
      return;
    }
    setFormError(null);
    createRecord.mutate({
      recordType: 'RECURRING_BILL',
      title: billName,
      data: {
        name: billName,
        amountCents,
        nextDueDate: billNextDate,
        frequency: billFreq,
        active: true
      }
    }, {
      onSuccess: () => {
        setBillName('');
        setBillAmount('');
        setBillNextDate('');
        setBillFreq('MONTHLY');
      }
    });
  };

  const formatMoney = (cents: number | undefined) => {
    if (cents === undefined || cents === null) return '--';
    return '$' + (cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  return (
    <div className="page-enter stagger-1 pb-12">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 mb-8">
        <div>
          <TechLabel className="text-muted-foreground">Finance // Manual Ledger</TechLabel>
          <h1 className="font-display text-4xl text-white mt-2 font-light tracking-tight">Runway Telemetry.</h1>
        </div>
        <div className="flex gap-4 items-center">
          <div className="state-badge">
            {summary?.dataStatus?.replaceAll('_', ' ') || 'NO DATA'}
          </div>
          <div className="state-badge danger">
            NOT CONNECTED
          </div>
        </div>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <HolographicPanel className="p-4">
          <TechLabel className="mb-2">Total Cash</TechLabel>
          <FinanceMetric loading={loadingSummary} cents={summary?.metrics?.totalCashCents} status={summary?.cashAfterBills?.status} />
        </HolographicPanel>
        <HolographicPanel className="p-4">
          <TechLabel className="mb-2">Monthly Budget</TechLabel>
          <FinanceMetric loading={loadingSummary} cents={summary?.metrics?.monthlyBudgetCents} status={summary?.monthlyBudget?.status} />
        </HolographicPanel>
        <HolographicPanel className="p-4">
          <TechLabel className="mb-2">Bills Due</TechLabel>
          <FinanceMetric loading={loadingSummary} cents={summary?.metrics?.billsDueCents} status={summary?.billsDue?.status} className="text-amber-500" />
        </HolographicPanel>
        <HolographicPanel className="p-4">
          <TechLabel className="mb-2">Cash After Bills</TechLabel>
          <FinanceMetric loading={loadingSummary} cents={summary?.metrics?.cashAfterBillsCents} status={summary?.cashAfterBills?.status} />
        </HolographicPanel>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_2fr] gap-6">
        <HolographicPanel title="LEDGER INPUT">
          {formError ? (
            <div className="mb-4 border border-red-500/30 bg-red-500/5 p-3 font-mono text-[10px] uppercase tracking-widest text-red-400">
              {formError}
            </div>
          ) : null}
          <div className="flex gap-2 mb-6 border-b border-primary/20 pb-2">
            <button
              className={`font-mono text-[10px] tracking-widest px-3 py-2 uppercase transition-colors ${activeTab === 'ACCOUNTS' ? 'text-primary bg-primary/10' : 'text-muted-foreground hover:text-primary/70'}`}
              onClick={() => setActiveTab('ACCOUNTS')}
            >
              Account
            </button>
            <button
              className={`font-mono text-[10px] tracking-widest px-3 py-2 uppercase transition-colors ${activeTab === 'BILLS' ? 'text-primary bg-primary/10' : 'text-muted-foreground hover:text-primary/70'}`}
              onClick={() => setActiveTab('BILLS')}
            >
              Bill
            </button>
          </div>

          {activeTab === 'ACCOUNTS' && (
            <form onSubmit={handleCreateAccount} className="space-y-4">
              <div>
                <label className="block tech-label mb-2 text-primary/70">Institution / Name</label>
                <input className="tech-input" value={accName} onChange={e => setAccName(e.target.value)} placeholder="Chase Checking" required />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block tech-label mb-2 text-primary/70">Type</label>
                  <select className="tech-input w-full bg-black/40" value={accType} onChange={e => setAccType(e.target.value)}>
                    <option value="CHECKING">CHECKING</option>
                    <option value="SAVINGS">SAVINGS</option>
                    <option value="CREDIT">CREDIT</option>
                    <option value="CASH">CASH</option>
                    <option value="OTHER">OTHER</option>
                  </select>
                </div>
                <div>
                  <label className="block tech-label mb-2 text-primary/70">Balance (USD)</label>
                  <input className="tech-input font-mono" type="number" step="0.01" value={accBalance} onChange={e => setAccBalance(e.target.value)} placeholder="0.00" required />
                </div>
              </div>
              <Button testId="btn-create-account" type="submit" disabled={createRecord.isPending} className="w-full mt-2">
                {createRecord.isPending ? 'COMMITTING...' : 'ADD ACCOUNT'}
              </Button>
            </form>
          )}

          {activeTab === 'BILLS' && (
            <form onSubmit={handleCreateBill} className="space-y-4">
              <div>
                <label className="block tech-label mb-2 text-primary/70">Biller Name</label>
                <input className="tech-input" value={billName} onChange={e => setBillName(e.target.value)} placeholder="AWS Hosting" required />
              </div>
              <div>
                <label className="block tech-label mb-2 text-primary/70">Amount (USD)</label>
                <input className="tech-input font-mono" type="number" min="0" step="0.01" value={billAmount} onChange={e => setBillAmount(e.target.value)} placeholder="0.00" required />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block tech-label mb-2 text-primary/70">Next Due</label>
                  <input className="tech-input font-mono" type="date" value={billNextDate} onChange={e => setBillNextDate(e.target.value)} required />
                </div>
                <div>
                  <label className="block tech-label mb-2 text-primary/70">Frequency</label>
                  <select className="tech-input w-full bg-black/40" value={billFreq} onChange={e => setBillFreq(e.target.value)}>
                    <option value="MONTHLY">MONTHLY</option>
                    <option value="ANNUAL">ANNUAL</option>
                    <option value="WEEKLY">WEEKLY</option>
                    <option value="BIWEEKLY">BIWEEKLY</option>
                    <option value="QUARTERLY">QUARTERLY</option>
                  </select>
                </div>
              </div>
              <Button testId="btn-create-bill" type="submit" disabled={createRecord.isPending} className="w-full mt-2">
                {createRecord.isPending ? 'COMMITTING...' : 'ADD BILL'}
              </Button>
            </form>
          )}
        </HolographicPanel>

        <div className="space-y-6">
          <HolographicPanel title="FINANCIAL ACCOUNTS">
            {loadingAccounts ? (
              <div className="py-8 text-center"><span className="tech-label animate-pulse">LOADING...</span></div>
            ) : !accounts || accounts.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground"><span className="tech-label">NO ACCOUNTS FOUND</span></div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {accounts.map(acc => (
                  <div key={acc.id} className="border border-primary/20 bg-black/40 p-3 flex justify-between items-center group relative">
                    <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        data-testid={`btn-del-account-${acc.id}`}
                        onClick={() => deleteRecord.mutate({ id: acc.id, type: 'FINANCIAL_ACCOUNT' })}
                        className="text-red-500 hover:text-red-400 p-1"
                        disabled={deleteRecord.isPending}
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                    <div className="flex gap-3 items-center">
                      <Landmark size={16} className="text-primary/70" />
                      <div>
                        <div className="font-mono text-[10px] text-primary/50 tracking-widest uppercase">{acc.data.type}</div>
                        <div className="text-sm font-medium">{acc.data.name}</div>
                      </div>
                    </div>
                    <div className="font-mono text-sm pr-6">{formatMoney(acc.data.balanceCents)}</div>
                  </div>
                ))}
              </div>
            )}
          </HolographicPanel>

          <HolographicPanel title="UPCOMING BILLS">
            {loadingBills ? (
              <div className="py-8 text-center"><span className="tech-label animate-pulse">LOADING...</span></div>
            ) : !bills || bills.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground"><span className="tech-label">NO BILLS RECORDED</span></div>
            ) : (
              <div className="grid grid-cols-1 gap-3">
                {bills.map(bill => (
                  <div key={bill.id} className="border border-primary/20 bg-black/40 p-3 flex justify-between items-center group relative">
                    <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        data-testid={`btn-del-bill-${bill.id}`}
                        onClick={() => deleteRecord.mutate({ id: bill.id, type: 'RECURRING_BILL' })}
                        className="text-red-500 hover:text-red-400 p-1"
                        disabled={deleteRecord.isPending}
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                    <div className="flex gap-3 items-center">
                      <Receipt size={16} className="text-amber-500/70" />
                      <div>
                        <div className="font-mono text-[10px] text-amber-500/50 tracking-widest uppercase">DUE: {bill.data.nextDueDate}</div>
                        <div className="text-sm font-medium text-amber-50">{bill.data.name}</div>
                      </div>
                    </div>
                    <div className="text-right pr-6">
                      <div className="font-mono text-[10px] text-muted-foreground uppercase">{bill.data.frequency}</div>
                      <div className="font-mono text-sm text-amber-500">{formatMoney(bill.data.amountCents)}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </HolographicPanel>
        </div>
      </div>
    </div>
  );
}
