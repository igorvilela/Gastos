import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { toPng } from 'html-to-image';
import { 
  Plus, 
  Trash2, 
  Download, 
  PieChart, 
  Layout, 
  Settings, 
  X,
  PlusCircle,
  TrendingUp,
  Calendar,
  DollarSign,
  Palette,
  Type as LucideType,
  Maximize2,
  Wallet,
  Edit2,
  Check,
  Heart,
  Music,
  Zap,
  Star,
  ChevronLeft,
  ChevronRight,
  Flame,
  Globe,
  Ghost,
  Home,
  ShoppingBasket,
  Pizza,
  PiggyBank,
  Coins,
  ArrowRight,
  CreditCard,
  LogOut,
  LogIn,
  User as UserIcon,
  ShieldCheck,
  ZapIcon
} from 'lucide-react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  Cell
} from 'recharts';
import { GoogleGenAI, Type } from "@google/genai";
import { Expense, FlyerConfig, Category, FlyerTheme } from './types';
import { auth, db, loginWithGoogle, logout } from './firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import { 
  collection, 
  doc, 
  onSnapshot, 
  addDoc, 
  deleteDoc, 
  setDoc,
  query,
  orderBy,
  updateDoc,
  getDocFromServer
} from 'firebase/firestore';
import { handleFirestoreError, OperationType } from './lib/utils';
import { ErrorBoundary } from './components/ErrorBoundary';

const CATEGORIES: Category[] = ['Fixos', 'Variáveis', 'Prazeres', 'Reserva', 'Cartão de Crédito'];
const COLORS = ['#141414', '#FF6321', '#4A90E2', '#50E3C2', '#9013FE'];

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [income, setIncome] = useState<number>(0);
  const [isEditingIncome, setIsEditingIncome] = useState(false);
  const [tempIncome, setTempIncome] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [isGeneratingAI, setIsGeneratingAI] = useState(false);
  const [flyerMode, setFlyerMode] = useState(false);
  const [selectedExpensesForFlyer, setSelectedExpensesForFlyer] = useState<Expense[]>([]);
  const [viewDate, setViewDate] = useState(new Date());
  const flyerRef = useRef<HTMLDivElement>(null);

  // Auth Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthLoading(false);
    });
    return unsubscribe;
  }, []);

  // Sync Expenses (Firestore)
  useEffect(() => {
    if (!user) {
      setExpenses([]);
      return;
    }

    const q = query(
      collection(db, 'users', user.uid, 'expenses'),
      orderBy('date', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const exps = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Expense[];
      setExpenses(exps);
    });

    return unsubscribe;
  }, [user]);

  // Sync Income (Firestore)
  useEffect(() => {
    if (!user) {
      setIncome(0);
      return;
    }

    const unsubscribe = onSnapshot(doc(db, 'users', user.uid), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (typeof data.income === 'number') {
          setIncome(data.income);
        }
      } else {
        // Initialize user doc if empty
        setDoc(doc(db, 'users', user.uid), { income: 0 }, { merge: true });
      }
    });

    return unsubscribe;
  }, [user]);
  
  // Clear selection on viewDate change
  useEffect(() => {
    setSelectedIds([]);
  }, [viewDate]);

  // Test connection on boot
  useEffect(() => {
    const testConnection = async () => {
      try {
        await getDocFromServer(doc(db, 'system', 'connection-test'));
      } catch (error) {
        if (error instanceof Error && error.message.includes('the client is offline')) {
          console.error("Firebase connection failed. Check configuration.");
        }
      }
    };
    testConnection();
  }, []);

  const [flyerConfig, setFlyerConfig] = useState<FlyerConfig>({
    title: 'Evento Especial',
    subtitle: 'Resumo de Despesas',
    primaryColor: '#141414',
    secondaryColor: '#FF6321',
    backgroundColor: '#FFFFFF',
    fontFamily: 'serif',
    layout: 'centered',
    theme: 'default',
    colors: {
      fixos: '#eb883a',
      variaveis: '#85a363',
      prazeres: '#d9b44a',
      income: '#f7b733'
    }
  });

  const downloadFlyer = async () => {
    if (flyerRef.current === null) return;
    
    try {
      const dataUrl = await toPng(flyerRef.current, {
        cacheBust: true,
        backgroundColor: flyerConfig.theme === 'default' ? '#fdfcf6' : flyerConfig.backgroundColor,
      });
      const link = document.createElement('a');
      link.download = `flyer-${flyerConfig.title.toLowerCase().replace(/\s+/g, '-')}.png`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error('Erro ao gerar PNG:', err);
    }
  };

  const handleSelectAll = () => {
    if (selectedIds.length === visibleExpenses.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(visibleExpenses.map(e => e.id));
    }
  };

  const toggleSelection = (id: string) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const openFlyerForSelection = () => {
    const selected = expenses.filter(e => selectedIds.includes(e.id));
    if (selected.length > 0) {
      setSelectedExpensesForFlyer(selected);
      setFlyerMode(true);
    }
  };

  const openFlyerForSingle = (expense: Expense) => {
    setSelectedExpensesForFlyer([expense]);
    setFlyerMode(true);
  };

  const generateAICopy = async () => {
    setIsGeneratingAI(true);
    try {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        console.error("GEMINI_API_KEY não configurada no ambiente.");
        setIsGeneratingAI(false);
        return;
      }
      const ai = new GoogleGenAI({ apiKey });
      const expensesList = selectedExpensesForFlyer.map(e => `- ${e.name} (${e.category}): R$ ${e.amount.toFixed(2)}`).join('\n');
      
      const prompt = `Crie um título e um subtítulo criativos e memoráveis para um flyer de controle de despesas/finanças. 
      As despesas selecionadas são:\n${expensesList}\n
      O título deve ser impactante e o subtítulo deve ser curto e explicativo.
      Responda APENAS em formato JSON com as chaves "title" e "subtitle".`;

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING },
              subtitle: { type: Type.STRING }
            },
            required: ["title", "subtitle"]
          }
        }
      });

      const data = JSON.parse(response.text);
      setFlyerConfig(prev => ({
        ...prev,
        title: data.title,
        subtitle: data.subtitle
      }));
    } catch (error) {
      console.error("Erro ao gerar cópia via IA:", error);
    } finally {
      setIsGeneratingAI(false);
    }
  };

  const handleIncomeSave = useCallback(async () => {
    if (!user) return;
    const val = parseFloat(tempIncome);
    if (!isNaN(val)) {
      try {
        const path = `users/${user.uid}`;
        await setDoc(doc(db, 'users', user.uid), { income: val }, { merge: true });
        setIsEditingIncome(false);
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, `users/${user.uid}`);
      }
    }
  }, [tempIncome, user]);

  const addExpense = useCallback(async (expense: Omit<Expense, 'id'>, installments: number = 1) => {
    if (!user) return;
    const groupId = Math.random().toString(36).slice(2, 11);
    const path = `users/${user.uid}/expenses`;
    
    try {
      if (expense.category === 'Fixos' || installments <= 1) {
        await addDoc(collection(db, path), {
          ...expense
        });
      } else {
        const baseDate = new Date(expense.date);
        for (let i = 0; i < installments; i++) {
          const currentDate = new Date(baseDate);
          currentDate.setMonth(baseDate.getMonth() + i);
          
          await addDoc(collection(db, path), {
            ...expense,
            name: `${expense.name} (${i + 1}/${installments})`,
            date: currentDate.toISOString(),
            installment: {
              current: i + 1,
              total: installments,
              groupId
            }
          });
        }
      }
      setIsAdding(false);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, path);
    }
  }, [user]);

  const deleteExpense = useCallback(async (id: string) => {
    if (!user) return;
    const path = `users/${user.uid}/expenses/${id}`;
    try {
      await deleteDoc(doc(db, 'users', user.uid, 'expenses', id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, path);
    }
  }, [user]);

  const deleteSelectedExpenses = useCallback(async () => {
    if (!user || selectedIds.length === 0) return;
    
    try {
      // We delete them sequentially for simplicity in this case
      for (const id of selectedIds) {
        await deleteDoc(doc(db, 'users', user.uid, 'expenses', id));
      }
      setSelectedIds([]);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `users/${user.uid}/expenses/multiple`);
    }
  }, [user, selectedIds]);

  const updateExpense = useCallback(async (id: string, updates: Partial<Expense>) => {
    if (!user) return;
    const path = `users/${user.uid}/expenses/${id}`;
    try {
      await updateDoc(doc(db, 'users', user.uid, 'expenses', id), updates);
      setEditingExpense(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, path);
    }
  }, [user]);

  const visibleExpenses = useMemo(() => {
    return expenses.filter(e => {
      const d = new Date(e.date);
      // Fixed expenses show if they started in or before the current month
      if (e.category === 'Fixos') {
        const expenseStart = new Date(d.getFullYear(), d.getMonth(), 1);
        const currentView = new Date(viewDate.getFullYear(), viewDate.getMonth(), 1);
        return expenseStart <= currentView;
      }
      return d.getMonth() === viewDate.getMonth() && d.getFullYear() === viewDate.getFullYear();
    });
  }, [expenses, viewDate]);

  const total = useMemo(() => visibleExpenses.reduce((sum, e) => sum + e.amount, 0), [visibleExpenses]);
  const balance = useMemo(() => income - total, [income, total]);

  const chartData = useMemo(() => CATEGORIES.map(cat => ({
    name: cat,
    value: visibleExpenses.filter(e => e.category === cat).reduce((sum, e) => sum + e.amount, 0)
  })).filter(d => d.value > 0), [visibleExpenses]);

  const tooltipContentStyle = useMemo(() => ({ 
    borderRadius: '12px', 
    border: 'none', 
    boxShadow: '0 10px 20px rgba(0,0,0,0.1)' 
  }), []);

  const tooltipCursor = useMemo(() => ({ fill: 'transparent' }), []);

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <motion.div 
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 2, ease: "linear" }}
          className="w-10 h-10 border-4 border-black border-t-transparent rounded-full"
        />
      </div>
    );
  }

  if (!user) {
    return (
      <ErrorBoundary>
        <LoginPage />
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary>
      <div className="min-h-screen pb-20">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-white/80 backdrop-blur-md border-b border-gray-100">
        <div className="max-w-5xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-black rounded-2xl flex items-center justify-center text-white rotate-6 shadow-lg shadow-black/20">
              <Wallet size={24} />
            </div>
            <div>
              <h1 className="font-black text-2xl tracking-tighter leading-none">FINANLLY</h1>
              <p className="text-[10px] text-gray-400 font-bold uppercase tracking-[0.3em]">Financial Intelligence</p>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="hidden sm:flex flex-col items-end mr-2">
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Usuário</span>
              <span className="text-xs font-bold text-gray-900">{user.displayName || user.email}</span>
            </div>
            <motion.button 
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={logout}
              className="flex items-center justify-center w-10 h-10 hover:bg-red-50 text-red-500 rounded-xl transition-colors border border-transparent hover:border-red-100"
              title="Sair"
            >
              <LogOut size={20} />
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => setIsAdding(true)}
              className="bg-black text-white px-6 py-2.5 rounded-2xl text-sm font-bold flex items-center gap-2 shadow-xl shadow-black/20"
            >
              <Plus size={18} />
              <span className="hidden sm:inline">Nova Despesa</span>
            </motion.button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 pt-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Stats Column */}
          <div className="lg:col-span-1 space-y-6">
            <section className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm relative overflow-hidden group">
              <div className="flex items-center justify-between mb-4">
                <span className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Entrada / Salário</span>
                <Wallet size={16} className="text-blue-500" />
              </div>
              
              {isEditingIncome ? (
                <div className="flex items-center gap-2">
                  <div className="flex items-baseline gap-1 flex-1">
                    <span className="text-sm font-semibold text-gray-400">R$</span>
                    <input 
                      autoFocus
                      type="number"
                      value={tempIncome}
                      onChange={(e) => setTempIncome(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleIncomeSave()}
                      className="text-2xl font-mono w-full outline-none border-b-2 border-accent/20 focus:border-accent pb-1"
                      placeholder="0.00"
                    />
                  </div>
                  <button 
                    onClick={handleIncomeSave}
                    className="p-2 bg-accent text-white rounded-xl shadow-lg shadow-accent/20"
                  >
                    <Check size={16} />
                  </button>
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <div className="flex items-baseline gap-1">
                    <span className="text-sm font-semibold text-gray-500">R$</span>
                    <span className="text-3xl font-mono font-medium tracking-tight">
                      {income.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                  <button 
                    onClick={() => {
                      setTempIncome(income.toString());
                      setIsEditingIncome(true);
                    }}
                    className="p-2 hover:bg-gray-100 rounded-xl text-gray-400 transition-colors"
                  >
                    <Edit2 size={16} />
                  </button>
                </div>
              )}
              
              {/* Progress bar decoration */}
              <div className="absolute bottom-0 left-0 h-1 bg-blue-500/10 w-full">
                <div 
                  className="h-full bg-blue-500 transition-all duration-1000" 
                  style={{ width: `${Math.min((total / (income || 1)) * 100, 100)}%` }}
                />
              </div>
            </section>

            <section className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <span className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Total Despendido</span>
                <TrendingUp size={16} className="text-red-500" />
              </div>
              <div className="flex items-baseline gap-1">
                <span className="text-sm font-semibold text-gray-500">R$</span>
                <span className="text-3xl font-mono font-medium tracking-tight text-red-500">
                  {total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </span>
              </div>
            </section>

            <section className={`p-6 rounded-3xl border shadow-sm transition-colors ${balance >= 0 ? 'bg-white border-gray-100' : 'bg-red-50 border-red-100'}`}>
              <div className="flex items-center justify-between mb-4">
                <span className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Saldo Restante</span>
                <div className={`w-2 h-2 rounded-full ${balance >= 0 ? 'bg-green-500' : 'bg-red-500'} animate-pulse`} />
              </div>
              <div className="flex items-baseline gap-1">
                <span className={`text-sm font-semibold ${balance >= 0 ? 'text-gray-500' : 'text-red-400'}`}>R$</span>
                <span className={`text-3xl font-mono font-medium tracking-tight ${balance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {balance.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </span>
              </div>
            </section>

            <section className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
              <h3 className="text-sm font-semibold mb-6">Por Categoria</h3>
              <div className="h-48 w-full">
                {chartData.length > 0 ? (
                  <div style={{ width: '100%', height: '100%', minWidth: 0 }}>
                    <BarChart width={300} height={192} data={chartData} style={{ width: '100%', height: '100%' }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F0F0F0" />
                      <XAxis 
                        dataKey="name" 
                        fontSize={10} 
                        tickLine={false} 
                        axisLine={false} 
                        tick={{ fill: '#999' }}
                      />
                      <YAxis hide />
                      <Tooltip 
                        contentStyle={tooltipContentStyle}
                        cursor={tooltipCursor}
                      />
                      <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                        {chartData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </div>
                ) : (
                  <div className="h-full flex items-center justify-center text-gray-300 text-sm italic">
                    Nenhum dado para exibir
                  </div>
                )}
              </div>
            </section>
          </div>

          {/* List Column */}
          <div className="lg:col-span-2 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="font-bold text-xl">Despesas Recentes</h2>
                <div className="flex flex-wrap items-center gap-1 mt-1">
                  <button 
                    onClick={() => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1))}
                    className="p-1 hover:bg-gray-100 rounded text-gray-400 hover:text-black transition-colors"
                  >
                    <ChevronLeft size={20} />
                    <span className="sr-only">Anterior</span>
                  </button>
                  
                  <div className="flex items-center gap-1 bg-gray-50 px-2 py-0.5 rounded-lg border border-gray-100">
                    <select 
                      value={viewDate.getMonth()}
                      onChange={(e) => setViewDate(new Date(viewDate.getFullYear(), parseInt(e.target.value), 1))}
                      className="bg-transparent font-bold capitalize outline-none cursor-pointer hover:text-accent transition-colors appearance-none text-sm py-1"
                    >
                      {Array.from({ length: 12 }).map((_, i) => (
                        <option key={i} value={i} className="capitalize py-1 text-black bg-white">
                          {new Date(2000, i, 1).toLocaleString('pt-BR', { month: 'long' })}
                        </option>
                      ))}
                    </select>
                    <span className="text-gray-300 font-light">/</span>
                    <select 
                      value={viewDate.getFullYear()}
                      onChange={(e) => setViewDate(new Date(parseInt(e.target.value), viewDate.getMonth(), 1))}
                      className="bg-transparent font-bold outline-none cursor-pointer hover:text-accent transition-colors appearance-none text-sm py-1"
                    >
                      {Array.from({ length: 11 }).map((_, i) => {
                        const year = new Date().getFullYear() - 5 + i;
                        return <option key={year} value={year} className="text-black bg-white">{year}</option>
                      })}
                    </select>
                  </div>

                  <button 
                    onClick={() => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1))}
                    className="p-1 hover:bg-gray-100 rounded text-gray-400 hover:text-black transition-colors"
                  >
                    <ChevronRight size={20} />
                    <span className="sr-only">Próximo</span>
                  </button>

                  <button 
                    onClick={() => setViewDate(new Date())}
                    className="ml-1 text-[10px] font-black uppercase tracking-widest text-gray-400 hover:text-accent transition-colors px-2 py-1"
                  >
                    Hoje
                  </button>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <button 
                  onClick={handleSelectAll}
                  className="flex items-center gap-2 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-colors"
                >
                  <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center transition-colors ${selectedIds.length === visibleExpenses.length && visibleExpenses.length > 0 ? 'bg-black border-black text-white' : 'bg-white border-gray-300'}`}>
                    {selectedIds.length === visibleExpenses.length && visibleExpenses.length > 0 && <Check size={10} />}
                  </div>
                  {selectedIds.length === visibleExpenses.length && visibleExpenses.length > 0 ? 'Desmarcar Tudo' : 'Selecionar Tudo'}
                </button>
                <span className="text-xs text-gray-400 font-medium bg-gray-100 px-2 py-1 rounded">
                  {visibleExpenses.length} itens
                </span>
              </div>
            </div>

            <div className="space-y-3">
              <AnimatePresence mode="popLayout">
                {visibleExpenses.length > 0 ? (
                  visibleExpenses.map((expense) => (
                    <motion.div
                      layout
                      key={expense.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      className={`group bg-white p-4 rounded-2xl border transition-all flex items-center justify-between shadow-sm relative ${selectedIds.includes(expense.id) ? 'border-accent ring-1 ring-accent/20' : 'border-gray-100 hover:border-accent/30'}`}
                    >
                      <div className="flex items-center gap-4">
                        <div className="flex items-center gap-3">
                          <input 
                            type="checkbox" 
                            checked={selectedIds.includes(expense.id)}
                            onChange={() => toggleSelection(expense.id)}
                            className="w-4 h-4 rounded border-gray-300 text-accent focus:ring-accent accent-accent"
                          />
                          <div className={`w-10 h-10 rounded-xl flex items-center justify-center bg-gray-50 text-gray-400 group-hover:bg-accent group-hover:text-white transition-colors ${selectedIds.includes(expense.id) ? 'bg-accent text-white' : ''}`}>
                            <DollarSign size={18} />
                          </div>
                        </div>
                        <div>
                          <h4 className="font-semibold text-gray-900 leading-none mb-1">{expense.name}</h4>
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">{expense.category}</span>
                            <span className="w-1 h-1 bg-gray-200 rounded-full"></span>
                            <span className="text-[10px] text-gray-400">{new Date(expense.date).toLocaleDateString('pt-BR')}</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className="font-mono font-medium text-lg">R$ {expense.amount.toFixed(2)}</span>
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button 
                            onClick={() => setEditingExpense(expense)}
                            className="p-2 hover:bg-gray-100 rounded-full text-gray-400 hover:text-blue-500 transition-colors"
                            title="Editar"
                          >
                            <Edit2 size={16} />
                          </button>
                          <button 
                            onClick={() => openFlyerForSingle(expense)}
                            className="p-2 hover:bg-gray-100 rounded-full text-gray-400 hover:text-accent transition-colors"
                            title="Gerar Flyer"
                          >
                            <Layout size={16} />
                          </button>
                          <button 
                            onClick={() => deleteExpense(expense.id)}
                            className="p-2 hover:bg-red-50 rounded-full text-gray-400 hover:text-red-500 transition-colors"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  ))
                ) : (
                  <div className="py-20 text-center space-y-4 bg-gray-50/50 rounded-3xl border-2 border-dashed border-gray-200">
                    <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center mx-auto shadow-sm">
                      <PieChart size={24} className="text-gray-300" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900">Nenhuma despesa registrada</h3>
                      <p className="text-sm text-gray-500 max-w-[240px] mx-auto mt-1">
                        Comece adicionando sua primeira despesa para visualizar suas finanças.
                      </p>
                    </div>
                  </div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>
      </main>

      {/* Fly-out Edit Form */}
      <AnimatePresence>
        {editingExpense && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setEditingExpense(null)}
              className="fixed inset-0 bg-black/20 backdrop-blur-sm z-50 px-6 sm:px-0 flex items-center justify-center"
            />
            <motion.div 
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed inset-y-0 right-0 w-full max-w-md bg-white z-50 shadow-2xl flex flex-col"
            >
              <div className="p-6 border-b border-gray-100 flex items-center justify-between">
                <h3 className="font-bold text-lg">Editar Despesa</h3>
                <button onClick={() => setEditingExpense(null)} className="p-2 hover:bg-gray-100 rounded-full">
                  <X size={20} />
                </button>
              </div>
              <ExpenseForm 
                initialData={editingExpense} 
                onSubmit={(data) => updateExpense(editingExpense.id, data)} 
              />
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Fly-out Add Form */}
      <AnimatePresence>
        {isAdding && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsAdding(false)}
              className="fixed inset-0 bg-black/20 backdrop-blur-sm z-50 px-6 sm:px-0 flex items-center justify-center"
            />
            <motion.div 
              initial={{ y: 100, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 100, opacity: 0 }}
              className="fixed inset-y-0 right-0 w-full max-w-md bg-white z-50 shadow-2xl flex flex-col"
            >
              <div className="p-6 border-b border-gray-100 flex items-center justify-between">
                <h3 className="font-bold text-lg">Nova Despesa</h3>
                <button onClick={() => setIsAdding(false)} className="p-2 hover:bg-gray-100 rounded-full">
                  <X size={20} />
                </button>
              </div>
              <ExpenseForm onSubmit={addExpense} />
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Flyer Generation Modal */}
      <AnimatePresence>
        {flyerMode && (
          <div className="fixed inset-0 z-50 overflow-y-auto bg-gray-100/95 backdrop-blur-lg flex items-center justify-center p-4">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-[40px] shadow-2xl w-full max-w-5xl h-[90vh] flex flex-col overflow-hidden"
            >
              <div className="p-6 border-b border-gray-100 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-accent/10 text-accent rounded-xl">
                    <Layout size={20} />
                  </div>
                  <div>
                    <h2 className="font-bold">Flyer Generator</h2>
                    <p className="text-xs text-gray-500 italic">Personalize para exportar ou compartilhar</p>
                  </div>
                </div>
                <button onClick={() => setFlyerMode(false)} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
                  <X size={24} />
                </button>
              </div>

              <div className="flex-1 overflow-hidden grid grid-cols-1 lg:grid-cols-2">
                {/* Editor Panel */}
                <div className="p-8 border-r border-gray-100 overflow-y-auto bg-gray-50/30">
                  <div className="space-y-8">
                    <section>
                      <div className="flex items-center justify-between mb-4">
                        <h4 className="text-xs font-bold uppercase tracking-widest text-gray-400 flex items-center gap-2">
                          <LucideType size={14} /> Conteúdo
                        </h4>
                        <motion.button 
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                          onClick={generateAICopy}
                          disabled={isGeneratingAI}
                          className="text-[10px] font-bold bg-accent/10 text-accent px-2 py-1 rounded border border-accent/20 flex items-center gap-1 disabled:opacity-50"
                        >
                          {isGeneratingAI ? "Gerando..." : "Gerar com IA"}
                        </motion.button>
                      </div>
                      <div className="space-y-4">
                        <div className="space-y-1">
                          <label className="text-xs font-semibold text-gray-600">Título do Evento</label>
                          <input 
                            type="text" 
                            value={flyerConfig.title}
                            onChange={(e) => setFlyerConfig({...flyerConfig, title: e.target.value})}
                            className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-accent/20 outline-none transition-all"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-xs font-semibold text-gray-600">Slogan / Subtítulo</label>
                          <input 
                            type="text" 
                            value={flyerConfig.subtitle}
                            onChange={(e) => setFlyerConfig({...flyerConfig, subtitle: e.target.value})}
                            className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-accent/20 outline-none transition-all"
                          />
                        </div>
                      </div>
                    </section>

                    <section>
                      <h4 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-4 flex items-center gap-2">
                        <Palette size={14} /> Temas do Flyer
                      </h4>
                      <div className="grid grid-cols-3 gap-2">
                        {(['default', 'rock', 'love', 'techno', 'minimal'] as const).map(t => (
                          <button
                            key={t}
                            onClick={() => {
                              let colors = { bg: '#FFFFFF', prim: '#141414', sec: '#FF6321' };
                              if (t === 'rock') colors = { bg: '#1A1A1A', prim: '#FFFFFF', sec: '#FF0000' };
                              if (t === 'love') colors = { bg: '#FFF0F5', prim: '#4A0E0E', sec: '#FF1493' };
                              if (t === 'techno') colors = { bg: '#000000', prim: '#00FFFF', sec: '#39FF14' };
                              if (t === 'minimal') colors = { bg: '#F5F5F5', prim: '#000000', sec: '#999999' };
                              
                              setFlyerConfig({
                                ...flyerConfig, 
                                theme: t,
                                backgroundColor: colors.bg,
                                primaryColor: colors.prim,
                                secondaryColor: colors.sec,
                                fontFamily: t === 'rock' ? 'mono' : t === 'love' ? 'serif' : flyerConfig.fontFamily
                              });
                            }}
                            className={`py-2 text-[10px] font-bold uppercase rounded-lg border transition-all ${flyerConfig.theme === t ? 'bg-black text-white border-black' : 'bg-white border-gray-200 hover:border-gray-300'}`}
                          >
                            {t}
                          </button>
                        ))}
                      </div>
                    </section>

                    <section>
                      <h4 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-4 flex items-center gap-2">
                        <Palette size={14} /> Estilo & Cores Personalizadas
                      </h4>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-6">
                        <ColorPicker 
                          label="Fundo" 
                          value={flyerConfig.backgroundColor} 
                          onChange={(c) => setFlyerConfig({...flyerConfig, backgroundColor: c})} 
                        />
                        <ColorPicker 
                          label="Primária" 
                          value={flyerConfig.primaryColor} 
                          onChange={(c) => setFlyerConfig({...flyerConfig, primaryColor: c})} 
                        />
                        <ColorPicker 
                          label="Acento" 
                          value={flyerConfig.secondaryColor} 
                          onChange={(c) => setFlyerConfig({...flyerConfig, secondaryColor: c})} 
                        />
                        <ColorPicker 
                          label="Caixa Fixos" 
                          value={flyerConfig.colors?.fixos || '#eb883a'} 
                          onChange={(c) => setFlyerConfig({
                            ...flyerConfig, 
                            colors: {
                              variaveis: '#85a363',
                              prazeres: '#d9b44a',
                              income: '#f7b733',
                              ...flyerConfig.colors, 
                              fixos: c 
                            }
                          })} 
                        />
                        <ColorPicker 
                          label="Caixa Variáveis" 
                          value={flyerConfig.colors?.variaveis || '#85a363'} 
                          onChange={(c) => setFlyerConfig({
                            ...flyerConfig, 
                            colors: { 
                              fixos: '#eb883a',
                              prazeres: '#d9b44a',
                              income: '#f7b733',
                              ...flyerConfig.colors, 
                              variaveis: c 
                            }
                          })} 
                        />
                        <ColorPicker 
                          label="Caixa Prazeres/Reserva" 
                          value={flyerConfig.colors?.prazeres || '#d9b44a'} 
                          onChange={(c) => setFlyerConfig({
                            ...flyerConfig, 
                            colors: { 
                              fixos: '#eb883a',
                              variaveis: '#85a363',
                              income: '#f7b733',
                              ...flyerConfig.colors, 
                              prazeres: c 
                            }
                          })} 
                        />
                        <ColorPicker 
                          label="Caixa Renda" 
                          value={flyerConfig.colors?.income || '#f7b733'} 
                          onChange={(c) => setFlyerConfig({
                            ...flyerConfig, 
                            colors: { 
                              fixos: '#eb883a',
                              variaveis: '#85a363',
                              prazeres: '#d9b44a',
                              ...flyerConfig.colors, 
                              income: c 
                            }
                          })} 
                        />
                      </div>
                    </section>

                    <section>
                      <h4 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-4 flex items-center gap-2">
                        <Maximize2 size={14} /> Layout & Tipografia
                      </h4>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <label className="text-xs font-semibold text-gray-600">Fonte</label>
                          <div className="flex gap-2">
                            {(['serif', 'sans', 'mono'] as const).map(f => (
                              <button
                                key={f}
                                onClick={() => setFlyerConfig({...flyerConfig, fontFamily: f})}
                                className={`flex-1 py-2 text-xs rounded-lg border transition-all ${flyerConfig.fontFamily === f ? 'bg-black text-white border-black' : 'bg-white border-gray-200 hover:border-gray-300'}`}
                              >
                                {f === 'serif' ? 'Playfair' : f === 'sans' ? 'Inter' : 'JetBrains'}
                              </button>
                            ))}
                          </div>
                        </div>
                        <div className="space-y-2">
                          <label className="text-xs font-semibold text-gray-600">Visual</label>
                          <div className="flex gap-2">
                            {(['centered', 'split', 'minimal'] as const).map(l => (
                              <button
                                key={l}
                                onClick={() => setFlyerConfig({...flyerConfig, layout: l})}
                                className={`flex-1 py-2 text-xs rounded-lg border transition-all ${flyerConfig.layout === l ? 'bg-black text-white border-black' : 'bg-white border-gray-200 hover:border-gray-300'}`}
                              >
                                {l.charAt(0).toUpperCase() + l.slice(1)}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    </section>

                    <button 
                      onClick={downloadFlyer}
                      className="w-full bg-accent text-white py-4 rounded-2xl font-bold flex items-center justify-center gap-2 shadow-lg shadow-accent/20 hover:scale-[1.02] transition-all"
                    >
                      <Download size={18} /> Baixar Flyer (PNG)
                    </button>
                  </div>
                </div>

                {/* Preview Panel */}
                <div className="p-8 flex items-center justify-center bg-gray-50/50 overflow-y-auto relative border-l border-gray-100">
                  <div 
                    className="shadow-2xl origin-top my-8 ring-1 ring-black/5 rounded-lg overflow-hidden shrink-0"
                    style={{ width: '400px', height: '566px' }}
                  >
                    <div style={{ width: '794px', height: '1123px', transform: 'scale(0.503)', transformOrigin: 'top left' }}>
                      <div ref={flyerRef}>
                        <Flyer 
                          config={flyerConfig} 
                          expenses={selectedExpensesForFlyer} 
                          income={income}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Bulk Action Bar */}
      <AnimatePresence>
        {selectedIds.length > 0 && (
          <motion.div 
            initial={{ y: 50, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 50, opacity: 0 }}
            className="fixed bottom-8 left-1/2 -translate-x-1/2 bg-black text-white px-6 py-4 rounded-3xl shadow-2xl flex items-center gap-6 z-40 border border-white/10"
          >
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 bg-accent rounded-full"></span>
              <span className="text-sm font-bold uppercase tracking-wider">{selectedIds.length} Selecionados</span>
            </div>
            <div className="w-[1px] h-4 bg-white/20"></div>
            <div className="flex items-center gap-2">
              <button 
                onClick={openFlyerForSelection}
                className="flex items-center gap-2 text-sm font-semibold hover:text-accent transition-colors"
              >
                <Layout size={16} />
                Gerar Flyer em Colunas
              </button>
              <div className="w-[1px] h-4 bg-white/20 ml-2"></div>
              <button 
                onClick={deleteSelectedExpenses}
                className="flex items-center gap-2 text-sm font-semibold text-red-400 hover:text-red-500 transition-colors ml-2"
              >
                <Trash2 size={16} />
                Excluir Selecionados
              </button>
              <button 
                onClick={() => setSelectedIds([])}
                className="flex items-center gap-2 text-sm font-semibold text-gray-400 hover:text-white transition-colors ml-4"
              >
                Cancelar
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
    </ErrorBoundary>
  );
}

function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-[#fdfcf6]">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md space-y-8 text-center"
      >
        <div className="space-y-4">
          <div className="w-20 h-20 bg-black rounded-[32px] flex items-center justify-center text-white mx-auto shadow-2xl rotate-6">
            <Wallet size={40} />
          </div>
          <div>
            <h1 className="text-4xl font-black tracking-tighter">FINANLLY</h1>
            <p className="text-gray-500 font-medium">Sua inteligência financeira começa aqui.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 pt-10">
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={loginWithGoogle}
            className="flex items-center justify-center gap-4 w-full h-16 bg-white border-2 border-gray-100 rounded-3xl font-bold shadow-xl shadow-black/5 hover:border-black transition-all"
          >
            <img src="https://www.google.com/favicon.ico" alt="Google" className="w-6 h-6" />
            Entrar com Google
          </motion.button>
          
          <div className="flex items-center gap-4 py-4">
            <div className="h-[1px] bg-gray-100 flex-1"></div>
            <span className="text-[10px] font-bold text-gray-300 uppercase tracking-widest">Segurança Garantida</span>
            <div className="h-[1px] bg-gray-100 flex-1"></div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            {[
              { icon: <ShieldCheck size={20} />, label: "Protegido" },
              { icon: <ZapIcon size={20} />, label: "Rápido" },
              { icon: <PieChart size={20} />, label: "Preciso" }
            ].map((item) => (
              <div key={item.label} className="flex flex-col items-center gap-2 p-4 rounded-2xl bg-white/50 border border-gray-100">
                <div className="text-gray-400">{item.icon}</div>
                <span className="text-[9px] font-bold uppercase tracking-wider text-gray-400">{item.label}</span>
              </div>
            ))}
          </div>
        </div>

        <p className="text-xs text-gray-400 pt-8 uppercase tracking-widest font-bold">
          Design estratégico • 2026
        </p>
      </motion.div>
    </div>
  );
}

function ExpenseForm({ onSubmit, initialData }: { 
  onSubmit: (e: Omit<Expense, 'id'>, installments: number) => void,
  initialData?: Expense 
}) {
  const [name, setName] = useState(initialData?.name || '');
  const [amount, setAmount] = useState(initialData?.amount.toString() || '');
  const [category, setCategory] = useState<Category>(initialData?.category || 'Fixos');
  const [date, setDate] = useState(initialData ? new Date(initialData.date).toISOString().split('T')[0] : new Date().toISOString().split('T')[0]);
  const [installments, setInstallments] = useState('1');

  return (
    <div className="p-6 space-y-6 flex-1 overflow-y-auto">
      <div className="space-y-4">
        <div className="space-y-1">
          <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">O que você comprou?</label>
          <input 
            type="text" 
            placeholder="Ex: Aluguel, Supermercado..."
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full border-b-2 border-gray-100 focus:border-black outline-none py-3 text-lg font-medium transition-all"
          />
        </div>

        <div className="grid grid-cols-2 gap-6">
          <div className="space-y-1">
            <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Valor (R$)</label>
            <input 
              type="number" 
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full border-b-2 border-gray-100 focus:border-black outline-none py-3 text-lg font-mono transition-all"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Data</label>
            <input 
              type="date" 
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full border-b-2 border-gray-100 focus:border-black outline-none py-3 text-lg transition-all"
            />
          </div>
        </div>

        {!initialData && category !== 'Fixos' && (
          <div className="space-y-1 animate-in slide-in-from-top-2 duration-300">
            <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Parcelas (Vezes)</label>
            <div className="flex items-center gap-4 py-2 border-b-2 border-gray-100 focus-within:border-black transition-all">
              <LucideType size={18} className="text-gray-300" />
              <input 
                type="number" 
                min="1"
                max="48"
                value={installments}
                onChange={(e) => setInstallments(e.target.value)}
                className="w-full outline-none text-lg font-mono"
              />
            </div>
            <p className="text-[10px] text-gray-400 italic">A despesa será replicada nos meses seguintes.</p>
          </div>
        )}

        <div className="space-y-2 pt-2">
          <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Categoria</label>
          <div className="flex flex-wrap gap-2">
            {CATEGORIES.map(cat => (
              <button
                key={cat}
                type="button"
                onClick={() => setCategory(cat)}
                className={`px-4 py-2 rounded-full text-xs font-medium transition-all ${category === cat ? 'bg-black text-white shadow-md' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>
      </div>

      <button
        type="button"
        disabled={!name || !amount}
        onClick={() => onSubmit({ name, amount: parseFloat(amount), category, date }, parseInt(installments) || 1)}
        className="w-full bg-black text-white py-4 rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-gray-800 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <PlusCircle size={20} />
        {initialData ? 'Atualizar Despesa' : 'Salvar Despesa'}
      </button>
    </div>
  );
}

function ColorPicker({ label, value, onChange }: { label: string, value: string, onChange: (c: string) => void }) {
  return (
    <div className="space-y-1">
      <label className="text-[10px] font-bold text-gray-500 uppercase">{label}</label>
      <div className="relative">
        <input 
          type="color" 
          value={value} 
          onChange={(e) => onChange(e.target.value)}
          className="w-full h-10 rounded-lg cursor-pointer border-none p-0 overflow-hidden"
        />
        <div className="absolute inset-0 pointer-events-none rounded-lg border border-gray-100 ring-1 ring-black/5"></div>
      </div>
    </div>
  );
}

function Flyer({ config, expenses, income }: { config: FlyerConfig, expenses: Expense[], income: number }) {
  const fontClass = config.fontFamily === 'serif' ? 'font-serif' : config.fontFamily === 'mono' ? 'font-mono' : 'font-sans';
  const incomeColor = config.colors?.income || '#f7b733';
  
  const totalExpenses = useMemo(() => expenses.reduce((sum, e) => sum + e.amount, 0), [expenses]);
  const balance = useMemo(() => income - totalExpenses, [income, totalExpenses]);
  
  const grouped = useMemo(() => [
    { 
      name: 'Fixos', 
      items: expenses.filter(e => e.category === 'Fixos'),
      icon: <Home size={16} />,
      color: config.colors?.fixos || '#eb883a'
    },
    { 
      name: 'Variáveis', 
      items: expenses.filter(e => e.category === 'Variáveis'),
      icon: <ShoppingBasket size={16} />,
      color: config.colors?.variaveis || '#85a363'
    },
    { 
      name: 'Prazeres + Reserva', 
      items: expenses.filter(e => e.category === 'Prazeres' || e.category === 'Reserva'),
      icon: <Pizza size={16} />,
      color: config.colors?.prazeres || '#d9b44a'
    },
    { 
      name: 'Cartão de Crédito', 
      items: expenses.filter(e => e.category === 'Cartão de Crédito'),
      icon: <CreditCard size={16} />,
      color: '#9013FE'
    }
  ], [expenses, config.colors]);

  return (
    <div 
      className={`w-full h-full relative flex flex-col p-12 overflow-hidden ${fontClass} transition-all`}
      style={{ 
        backgroundColor: config.theme === 'default' ? '#fdfcf6' : config.backgroundColor, 
        color: config.primaryColor 
      }}
    >
      <div className="relative z-10 h-full flex flex-col">
        {/* Header */}
        <div className="text-center mb-10">
          <motion.h1 
            initial={{ y: -10, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="text-4xl font-black uppercase tracking-tight text-[#2d3a4b]"
          >
            {config.title}
          </motion.h1>
          <div className="flex items-center justify-center gap-3 mt-3">
            <span className="h-[2px] w-8 bg-black/10"></span>
            <p className="text-xs uppercase font-bold tracking-[0.4em] text-accent opacity-70">{config.subtitle}</p>
            <span className="h-[2px] w-8 bg-black/10"></span>
          </div>
        </div>

        {/* Income Section */}
        <div className="mb-10">
          <div className="p-1 rounded-[32px] shadow-xl" style={{ backgroundColor: incomeColor }}>
            <div className="rounded-[28px] p-8 text-white" style={{ background: `linear-gradient(135deg, ${incomeColor}, ${incomeColor}cc)` }}>
              <div className="flex items-center gap-3 border-b border-white/30 pb-4 mb-6">
                <div className="bg-white/20 p-2 rounded-xl">
                  <Wallet size={20} />
                </div>
                <span className="text-sm font-black uppercase tracking-[0.2em]">Renda Mensal Consolidada</span>
              </div>
              <div className="flex justify-between items-center">
                <div className="space-y-1">
                  <p className="text-xs font-bold opacity-80 uppercase tracking-widest">Receita Total Disponível</p>
                  <p className="text-5xl font-black tracking-tighter">R$ {income.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                </div>
                <div className="bg-white/10 px-6 py-4 rounded-2xl border border-white/20 backdrop-blur-md">
                  <p className="text-[10px] uppercase font-black opacity-60 mb-1">Status de Fluxo</p>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
                    <p className="text-sm font-black uppercase">Excelente</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Expenses Boxes - Vertical Layout for A4 */}
        <div className="flex-1 space-y-6 mb-10">
          {grouped.map((group) => {
            const subtotal = group.items.reduce((s, i) => s + i.amount, 0);
            
            return (
              <div key={group.name} className="flex flex-col">
                <div 
                  className="rounded-t-3xl p-4 text-white flex items-center gap-3"
                  style={{ backgroundColor: group.color }}
                >
                  <div className="bg-white/20 p-2 rounded-lg">
                    {group.icon}
                  </div>
                  <span className="text-sm font-black uppercase tracking-widest">{group.name}</span>
                  <div className="ml-auto bg-white/20 px-4 py-1.5 rounded-full text-xs font-black">
                    R$ {subtotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </div>
                </div>
                <div className="bg-white/40 backdrop-blur-md border border-current/5 p-6 rounded-b-3xl flex flex-wrap gap-x-8 gap-y-4">
                  {group.items.length > 0 ? (
                    group.items.map(item => (
                      <div key={item.id} className="flex items-center gap-2 min-w-[200px]">
                        <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: group.color }} />
                        <span className="text-sm font-bold opacity-80 flex-1">{item.name}</span>
                        <span className="text-sm font-mono font-black border-b-2 border-dotted" style={{ borderColor: `${group.color}44`, color: group.color }}>
                          R$ {item.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                    ))
                  ) : (
                    <div className="w-full text-center py-4 opacity-20 italic text-xs">Sem registros nesta categoria</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Total General Bar */}
        <div className="mb-10 bg-black/5 p-6 rounded-[32px] flex items-center justify-between border-l-[12px]" style={{ borderColor: incomeColor }}>
          <span className="text-lg font-black uppercase tracking-[0.2em] opacity-80">Total Geral de Despesas</span>
          <span className="text-3xl font-black" style={{ color: incomeColor }}>R$ {totalExpenses.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
        </div>

        {/* Comparison Bottom Section */}
        <div className="bg-current/5 border border-current/10 rounded-[40px] p-10 relative overflow-hidden shrink-0">
          <div className="flex items-center justify-between mb-8">
            <h4 className="text-sm font-black uppercase tracking-[0.3em] opacity-60 flex items-center gap-3">
              <TrendingUp size={24} /> Balanço de Performance
            </h4>
            <div className="bg-white/50 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest opacity-40">
              Gerado via Finanlly AI
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-12 relative z-10">
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-xs font-bold opacity-40 uppercase tracking-widest">Capital Inicial</span>
                <span className="text-lg font-black">R$ {income.toLocaleString('pt-BR')}</span>
              </div>
              <div className="flex justify-between items-center text-red-500/60">
                <span className="text-xs font-bold uppercase tracking-widest">Saídas Totais</span>
                <span className="text-lg font-black underline decoration-2 underline-offset-4">R$ {totalExpenses.toLocaleString('pt-BR')}</span>
              </div>
            </div>
            
            <div className="flex flex-col items-end justify-center">
              <span className="text-xs font-black opacity-30 uppercase tracking-[0.3em] mb-2">Liquidez Final</span>
              <div 
                className="text-white px-8 py-4 rounded-[24px] text-3xl font-black shadow-2xl flex items-center gap-4"
                style={{ 
                  backgroundColor: balance >= 0 ? '#85a363' : '#ed4956',
                  boxShadow: `0 20px 40px ${balance >= 0 ? '#85a36344' : '#ed495644'}`
                }}
              >
                R$ {balance.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                {balance >= 0 ? <TrendingUp size={32} /> : <ArrowRight size={32} className="rotate-45" />}
              </div>
            </div>
          </div>
          
          <PiggyBank size={180} className="absolute -bottom-10 -left-10 opacity-[0.03] -rotate-12" />
        </div>
        
        {/* Fine Print */}
        <div className="mt-auto pt-10 text-center border-t border-black/5">
          <p className="text-[10px] uppercase tracking-[0.5em] font-black opacity-30">Relatório Financeiro Estratégico • Finanlly Intelligence</p>
        </div>
      </div>
    </div>
  );
}
