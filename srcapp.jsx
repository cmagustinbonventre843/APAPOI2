import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  LayoutDashboard, Receipt, Brain, Target, TrendingUp, Settings, 
  Plus, Trash2, LogOut, Crown, ChevronRight, PieChart, AlertCircle, 
  Send, Sparkles, ArrowUpRight, ArrowDownRight, Wallet, Menu, X, Check, Loader2
} from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged, updateProfile } from 'firebase/auth';
import { getFirestore, collection, doc, setDoc, deleteDoc, onSnapshot, addDoc, updateDoc } from 'firebase/firestore';

// --- CONFIGURACIÓN FIREBASE ---
// Adaptado para funcionar tanto en entornos inyectados (Canvas) como en Vite local
const firebaseConfig = typeof __firebase_config !== 'undefined' 
  ? JSON.parse(__firebase_config) 
  : {
      // Si usas Vite localmente, idealmente reemplaza esto con tus import.meta.env.VITE_FIREBASE_...
    };

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';

// --- UTILIDADES Y CONSTANTES ---
const CATEGORIAS = {
  ingreso: ['Salario', 'Freelance', 'Inversiones', 'Regalo', 'Otros Ingresos'],
  gasto: ['Comida', 'Transporte', 'Hogar', 'Servicios', 'Entretenimiento', 'Salud', 'Educación', 'Ropa', 'Otros Gastos']
};

const DICCIONARIO_CATEGORIAS = {
  'mcdonalds': 'Comida', 'burger': 'Comida', 'pizza': 'Comida', 'supermercado': 'Comida', 'coto': 'Comida', 'carrefour': 'Comida',
  'uber': 'Transporte', 'cabify': 'Transporte', 'didi': 'Transporte', 'taxi': 'Transporte', 'gasolina': 'Transporte', 'ypf': 'Transporte',
  'netflix': 'Entretenimiento', 'spotify': 'Entretenimiento', 'cine': 'Entretenimiento', 'steam': 'Entretenimiento',
  'luz': 'Servicios', 'agua': 'Servicios', 'internet': 'Servicios', 'claro': 'Servicios', 'movistar': 'Servicios', 'personal': 'Servicios',
  'farmacia': 'Salud', 'hospital': 'Salud', 'medico': 'Salud'
};

const autoCategorizar = (descripcion) => {
  const descLower = descripcion.toLowerCase();
  for (const [key, category] of Object.entries(DICCIONARIO_CATEGORIAS)) {
    if (descLower.includes(key)) return category;
  }
  return 'Otros Gastos';
};

const formatMoney = (amount) => {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(amount);
};

// --- COMPONENTES PRINCIPALES ---

export default function ApapoiApp() {
  const [user, setUser] = useState(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);

  // Inicialización de Auth
  useEffect(() => {
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (error) {
        console.error("Error de autenticación:", error);
      }
    };
    initAuth();

    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setIsAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  if (isAuthLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600"></div>
      </div>
    );
  }

  if (!user || (user.isAnonymous && !user.displayName)) {
    return <AuthScreen user={user} />;
  }

  return <MainLayout user={user} />;
}

// --- PANTALLA DE AUTENTICACIÓN / ONBOARDING ---
function AuthScreen({ user }) {
  const [nombre, setNombre] = useState('');

  const handleStart = async (e) => {
    e.preventDefault();
    if (!nombre.trim() || !user) return;
    await updateProfile(user, { displayName: nombre });
    window.location.reload(); 
  };

  return (
    <div className="min-h-screen bg-white flex items-center justify-center p-4">
      <div className="max-w-md w-full text-center">
        <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-emerald-100 text-emerald-600 mb-8">
          <Brain size={40} />
        </div>
        <h1 className="text-4xl font-bold text-gray-900 mb-4">Apapoi</h1>
        <p className="text-lg text-gray-600 mb-8">
          Tu entrenador financiero personal inteligente. Controla, analiza y mejora tus finanzas.
        </p>
        <form onSubmit={handleStart} className="space-y-4">
          <input
            type="text"
            placeholder="¿Cómo te llamas?"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none transition-all text-lg"
            required
          />
          <button
            type="submit"
            className="w-full bg-emerald-600 text-white font-semibold py-3 px-4 rounded-xl hover:bg-emerald-700 transition-colors flex items-center justify-center gap-2 text-lg"
          >
            Comenzar mi viaje <ChevronRight size={20} />
          </button>
        </form>
      </div>
    </div>
  );
}

// --- LAYOUT PRINCIPAL Y NAVEGACIÓN ---
function MainLayout({ user }) {
  const [currentView, setCurrentView] = useState('dashboard');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isPremium, setIsPremium] = useState(true); 

  // Datos globales
  const [transactions, setTransactions] = useState([]);
  const [goals, setGoals] = useState([]);
  const [isLoadingData, setIsLoadingData] = useState(true);

  // Fetch Data
  useEffect(() => {
    if (!user) return;

    const txRef = collection(db, 'artifacts', appId, 'users', user.uid, 'transactions');
    const goalsRef = collection(db, 'artifacts', appId, 'users', user.uid, 'goals');

    const unsubTx = onSnapshot(txRef, (snapshot) => {
      const txs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      txs.sort((a, b) => new Date(b.date) - new Date(a.date));
      setTransactions(txs);
      setIsLoadingData(false);
    }, (error) => console.error("Error fetching tx:", error));

    const unsubGoals = onSnapshot(goalsRef, (snapshot) => {
      const gs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setGoals(gs);
    }, (error) => console.error("Error fetching goals:", error));

    return () => { unsubTx(); unsubGoals(); };
  }, [user]);

  const navItems = [
    { id: 'dashboard', label: 'Resumen', icon: LayoutDashboard },
    { id: 'transactions', label: 'Movimientos', icon: Receipt },
    { id: 'coach', label: 'Coach IA', icon: Brain, premium: true },
    { id: 'simulator', label: 'Simulador', icon: TrendingUp, premium: true },
    { id: 'goals', label: 'Metas', icon: Target },
    { id: 'rule33', label: 'Regla 33%', icon: PieChart },
    { id: 'settings', label: 'Ajustes', icon: Settings },
  ];

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col md:flex-row font-sans">
      {/* Navbar Móvil */}
      <div className="md:hidden bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between sticky top-0 z-50">
        <div className="flex items-center gap-2 text-emerald-600 font-bold text-xl">
          <Brain size={24} /> Apapoi
        </div>
        <button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} className="text-gray-600">
          {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      {/* Sidebar */}
      <aside className={`
        ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'} 
        md:translate-x-0 fixed md:sticky top-0 left-0 w-64 h-screen bg-white border-r border-gray-200 flex flex-col transition-transform duration-300 z-40
      `}>
        <div className="hidden md:flex items-center gap-2 text-emerald-600 font-bold text-2xl px-6 py-8">
          <Brain size={28} /> Apapoi
        </div>

        <div className="px-6 pb-6">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700 font-bold">
              {user.displayName?.charAt(0).toUpperCase() || 'U'}
            </div>
            <div>
              <p className="font-semibold text-gray-900 truncate">{user.displayName}</p>
              <div className="flex items-center gap-1 text-xs font-medium">
                {isPremium ? (
                  <span className="text-yellow-600 flex items-center gap-1"><Crown size={12}/> Premium</span>
                ) : (
                  <span className="text-gray-500">Plan Gratis</span>
                )}
              </div>
            </div>
          </div>
        </div>

        <nav className="flex-1 px-4 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isLocked = item.premium && !isPremium;
            return (
              <button
                key={item.id}
                onClick={() => {
                  setCurrentView(item.id);
                  setIsMobileMenuOpen(false);
                }}
                className={`w-full flex items-center justify-between px-3 py-3 rounded-xl transition-colors ${
                  currentView === item.id 
                    ? 'bg-emerald-50 text-emerald-700 font-semibold' 
                    : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Icon size={20} className={currentView === item.id ? 'text-emerald-600' : 'text-gray-400'} />
                  {item.label}
                </div>
                {isLocked && <Crown size={14} className="text-yellow-400" />}
              </button>
            )
          })}
        </nav>

        {!isPremium && (
          <div className="p-4 m-4 bg-gradient-to-br from-gray-900 to-gray-800 rounded-2xl text-white text-sm relative overflow-hidden">
            <div className="relative z-10">
              <Crown size={20} className="text-yellow-400 mb-2" />
              <h4 className="font-semibold mb-1">Desbloquea todo</h4>
              <p className="text-gray-300 text-xs mb-3">Coach IA y simulador avanzado.</p>
              <button onClick={() => setIsPremium(true)} className="w-full bg-white text-gray-900 py-2 rounded-lg font-medium hover:bg-gray-100 transition-colors">
                Probar Premium
              </button>
            </div>
            <div className="absolute -right-4 -bottom-4 opacity-10">
              <Brain size={100} />
            </div>
          </div>
        )}
      </aside>

      {/* Contenido Principal */}
      <main className="flex-1 overflow-y-auto relative w-full">
        {isLoadingData ? (
           <div className="flex items-center justify-center h-full"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600"></div></div>
        ) : (
          <div className="p-4 md:p-8 max-w-5xl mx-auto pb-24 md:pb-8">
            {currentView === 'dashboard' && <Dashboard txs={transactions} isPremium={isPremium} user={user} setView={setCurrentView} />}
            {currentView === 'transactions' && <TransactionManager txs={transactions} user={user} />}
            {currentView === 'coach' && <CoachChat txs={transactions} isPremium={isPremium} setView={setCurrentView} />}
            {currentView === 'simulator' && <Simulator txs={transactions} isPremium={isPremium} setView={setCurrentView} />}
            {currentView === 'goals' && <GoalManager goals={goals} user={user} txs={transactions} />}
            {currentView === 'rule33' && <Rule33View txs={transactions} />}
            {currentView === 'settings' && <SettingsView user={user} isPremium={isPremium} setIsPremium={setIsPremium} />}
          </div>
        )}
      </main>
    </div>
  );
}

// --- VISTAS ---

// 1. DASHBOARD
function Dashboard({ txs, isPremium, user, setView }) {
  const currentMonth = new Date().getMonth();
  const currentYear = new Date().getFullYear();

  const [aiAnalysis, setAiAnalysis] = useState('');
  const [isGeneratingAnalysis, setIsGeneratingAnalysis] = useState(false);

  const stats = useMemo(() => {
    let ingresos = 0;
    let gastos = 0;
    let gastosMesPasado = 0;
    const categoriasGastos = {};

    txs.forEach(tx => {
      const txDate = new Date(tx.date);
      const amount = Number(tx.amount);
      
      if (txDate.getMonth() === currentMonth && txDate.getFullYear() === currentYear) {
        if (tx.type === 'ingreso') ingresos += amount;
        else {
          gastos += amount;
          categoriasGastos[tx.category] = (categoriasGastos[tx.category] || 0) + amount;
        }
      } else if (txDate.getMonth() === (currentMonth === 0 ? 11 : currentMonth - 1)) {
         if (tx.type === 'gasto') gastosMesPasado += amount;
      }
    });

    const balance = ingresos - gastos;
    const topCategory = Object.keys(categoriasGastos).sort((a,b) => categoriasGastos[b] - categoriasGastos[a])[0];
    
    return { ingresos, gastos, balance, gastosMesPasado, topCategory, categoriasGastos };
  }, [txs, currentMonth, currentYear]);

  const getDailyTip = () => {
    if (txs.length === 0) return "¡Bienvenido! Agrega tu primer movimiento para comenzar a recibir consejos.";
    if (stats.gastos > stats.ingresos && stats.ingresos > 0) return "⚠️ Cuidado: Tus gastos están superando tus ingresos este mes.";
    if (stats.topCategory) return `💡 Recomendación del día: El mayor porcentaje de tu dinero se va en "${stats.topCategory}". Si reduces esto un 10%, mejorarás tu capacidad de ahorro significativamente.`;
    if (stats.gastos > stats.gastosMesPasado && stats.gastosMesPasado > 0) return "📈 Atención: Estás gastando más que el mes pasado a esta misma fecha.";
    return "💡 ¡Vas por buen camino! Sigue controlando tus gastos diarios.";
  };

  const handleGenerateAnalysis = async () => {
    setIsGeneratingAnalysis(true);
    try {
      const apiKey = import.meta.env.VITE_GEMINI_API_KEY || "";
      const prompt = `Analiza mi resumen mensual financiero actual. Ingresos del mes: $${stats.ingresos}, Gastos del mes: $${stats.gastos}. Mi mayor gasto fue en ${stats.topCategory} con $${stats.categoriasGastos[stats.topCategory]}. Balance actual: $${stats.balance}. Escribe un análisis breve de un párrafo seguido de 2 viñetas cortas con recomendaciones para el próximo mes.`;
      
      const payload = {
        contents: [{ parts: [{ text: prompt }] }],
        systemInstruction: { parts: [{ text: "Eres Apapoi, un asesor financiero personal experto y amigable. Sé directo, claro y usa un tono motivador." }] }
      };

      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) throw new Error("API Error");
      const data = await response.json();
      setAiAnalysis(data.candidates?.[0]?.content?.parts?.[0]?.text || "No pude generar el análisis. Intenta nuevamente.");
    } catch (error) {
      console.error(error);
      setAiAnalysis("Hubo un error de conexión con la IA. Intenta más tarde.");
    } finally {
      setIsGeneratingAnalysis(false);
    }
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      <header className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Hola, {user.displayName} 👋</h1>
        <p className="text-gray-500">Aquí está el resumen de tus finanzas este mes.</p>
      </header>

      <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-4 flex gap-4 items-start">
        <div className="mt-1 bg-emerald-100 p-2 rounded-full text-emerald-600">
          <Sparkles size={20} />
        </div>
        <div>
          <h3 className="font-semibold text-emerald-900">Insight Inteligente</h3>
          <p className="text-emerald-700 text-sm mt-1">{getDailyTip()}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
          <div className="flex items-center gap-2 text-gray-500 mb-2">
            <Wallet size={18} /> Balance Actual
          </div>
          <div className={`text-3xl font-bold ${stats.balance >= 0 ? 'text-gray-900' : 'text-red-600'}`}>
            {formatMoney(stats.balance)}
          </div>
        </div>
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
          <div className="flex items-center gap-2 text-gray-500 mb-2">
             <ArrowUpRight size={18} className="text-emerald-500" /> Ingresos
          </div>
          <div className="text-2xl font-bold text-gray-900">{formatMoney(stats.ingresos)}</div>
        </div>
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
          <div className="flex items-center gap-2 text-gray-500 mb-2">
             <ArrowDownRight size={18} className="text-red-500" /> Gastos
          </div>
          <div className="text-2xl font-bold text-gray-900">{formatMoney(stats.gastos)}</div>
          {stats.gastosMesPasado > 0 && (
             <p className="text-xs text-gray-400 mt-2">
               vs {formatMoney(stats.gastosMesPasado)} mes pasado
             </p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6">
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 lg:col-span-2">
          <div className="flex justify-between items-center mb-6">
            <h3 className="font-bold text-gray-900">Desglose de Gastos</h3>
          </div>
          <div className="space-y-4">
            {Object.keys(stats.categoriasGastos).length === 0 ? (
               <p className="text-gray-400 text-sm italic">No hay gastos este mes.</p>
            ) : (
               Object.entries(stats.categoriasGastos)
                 .sort((a,b) => b[1] - a[1])
                 .slice(0, 5)
                 .map(([cat, amount]) => {
                   const percentage = (amount / stats.gastos) * 100;
                   return (
                     <div key={cat} className="relative">
                       <div className="flex justify-between text-sm mb-1">
                         <span className="font-medium text-gray-700">{cat}</span>
                         <span className="text-gray-500">{formatMoney(amount)} ({percentage.toFixed(0)}%)</span>
                       </div>
                       <div className="w-full bg-gray-100 rounded-full h-2">
                         <div className="bg-emerald-500 h-2 rounded-full" style={{ width: `${percentage}%` }}></div>
                       </div>
                     </div>
                   )
                 })
            )}
          </div>
        </div>

        <div className="space-y-4">
           <button onClick={() => setView('transactions')} className="w-full bg-gray-900 text-white p-4 rounded-2xl font-medium flex items-center justify-between hover:bg-gray-800 transition-colors">
             <div className="flex items-center gap-3"><Plus size={20}/> Nuevo Movimiento</div>
             <ChevronRight size={18} className="text-gray-400"/>
           </button>
           
           <div className="bg-gradient-to-br from-emerald-600 to-teal-700 rounded-2xl p-5 text-white relative overflow-hidden group cursor-pointer" onClick={() => setView('coach')}>
             <div className="relative z-10">
               <Brain size={24} className="mb-3" />
               <h3 className="font-bold text-lg mb-1">Habla con tu Coach</h3>
               <p className="text-emerald-100 text-sm text-balance">Haz preguntas sobre tus finanzas y recibe consejos con IA.</p>
             </div>
             <div className="absolute right-0 bottom-0 opacity-20 transform translate-x-4 translate-y-4 group-hover:scale-110 transition-transform">
               <Brain size={120} />
             </div>
           </div>
        </div>
      </div>

      <div className="bg-white p-6 rounded-2xl shadow-sm border border-emerald-100 mt-6 animate-fadeIn">
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-bold text-gray-900 flex items-center gap-2">
            <Brain size={20} className="text-emerald-600"/> Diagnóstico Mensual Apapoi
          </h3>
          <button 
            onClick={handleGenerateAnalysis}
            disabled={isGeneratingAnalysis}
            className="flex items-center gap-2 bg-emerald-100 text-emerald-800 hover:bg-emerald-200 px-4 py-2 rounded-xl text-sm font-semibold transition-colors disabled:opacity-50"
          >
            {isGeneratingAnalysis ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
            ✨ Generar Diagnóstico
          </button>
        </div>
        
        {aiAnalysis && (
          <div className="bg-gray-50/80 p-5 rounded-xl text-sm text-gray-800 leading-relaxed border border-gray-200">
            {aiAnalysis.split('\n').map((line, i) => (
              <p key={i} className="mb-2 last:mb-0">
                {line.split('**').map((part, index) => index % 2 === 1 ? <strong key={index}>{part}</strong> : part)}
              </p>
            ))}
          </div>
        )}
        {!aiAnalysis && !isGeneratingAnalysis && (
          <p className="text-sm text-gray-500 text-center py-4 italic">Haz clic en el botón para recibir un diagnóstico completo de tus finanzas este mes usando Inteligencia Artificial.</p>
        )}
      </div>
    </div>
  );
}

// 2. GESTOR DE TRANSACCIONES
function TransactionManager({ txs, user }) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState({
    type: 'gasto', amount: '', description: '', category: 'Otros Gastos', date: new Date().toISOString().split('T')[0]
  });

  const handleDescChange = (e) => {
    const desc = e.target.value;
    setFormData(prev => ({ 
      ...prev, 
      description: desc,
      category: prev.type === 'gasto' ? autoCategorizar(desc) : prev.category 
    }));
  };

  const saveTransaction = async (e) => {
    e.preventDefault();
    if (!formData.amount || !formData.description) return;

    try {
      await addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'transactions'), {
        ...formData,
        amount: Number(formData.amount)
      });
      setIsModalOpen(false);
      setFormData({ type: 'gasto', amount: '', description: '', category: 'Otros Gastos', date: new Date().toISOString().split('T')[0] });
    } catch (error) {
      console.error("Error guardando:", error);
    }
  };

  const deleteTx = async (id) => {
    try {
      await deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'transactions', id));
    } catch (error) {
      console.error("Error eliminando:", error);
    }
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-gray-900">Movimientos</h2>
        <button onClick={() => setIsModalOpen(true)} className="bg-emerald-600 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-emerald-700 flex items-center gap-2">
          <Plus size={16} /> Agregar
        </button>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        {txs.length === 0 ? (
          <div className="p-10 text-center text-gray-500">
            <Receipt size={40} className="mx-auto mb-3 text-gray-300" />
            <p>No tienes movimientos registrados.</p>
          </div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {txs.map(tx => (
              <li key={tx.id} className="p-4 flex items-center justify-between hover:bg-gray-50 transition-colors">
                <div className="flex items-center gap-4">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center ${tx.type === 'ingreso' ? 'bg-emerald-100 text-emerald-600' : 'bg-red-100 text-red-600'}`}>
                    {tx.type === 'ingreso' ? <ArrowUpRight size={20} /> : <ArrowDownRight size={20} />}
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900">{tx.description}</p>
                    <p className="text-xs text-gray-500">{tx.category} • {new Date(tx.date).toLocaleDateString()}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <span className={`font-bold ${tx.type === 'ingreso' ? 'text-emerald-600' : 'text-gray-900'}`}>
                    {tx.type === 'ingreso' ? '+' : '-'}{formatMoney(tx.amount)}
                  </span>
                  <button onClick={() => deleteTx(tx.id)} className="text-gray-400 hover:text-red-500">
                    <Trash2 size={16} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl w-full max-w-md p-6 shadow-xl animate-scaleIn">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold">Nuevo Movimiento</h3>
              <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-900"><X size={24}/></button>
            </div>
            
            <form onSubmit={saveTransaction} className="space-y-4">
              <div className="flex bg-gray-100 p-1 rounded-xl">
                <button type="button" onClick={() => setFormData({...formData, type: 'gasto', category: 'Otros Gastos'})} className={`flex-1 py-2 text-sm font-medium rounded-lg ${formData.type === 'gasto' ? 'bg-white shadow text-gray-900' : 'text-gray-500'}`}>Gasto</button>
                <button type="button" onClick={() => setFormData({...formData, type: 'ingreso', category: 'Salario'})} className={`flex-1 py-2 text-sm font-medium rounded-lg ${formData.type === 'ingreso' ? 'bg-white shadow text-gray-900' : 'text-gray-500'}`}>Ingreso</button>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Monto</label>
                <input type="number" required value={formData.amount} onChange={(e) => setFormData({...formData, amount: e.target.value})} className="w-full text-2xl font-bold text-gray-900 border-none outline-none focus:ring-0 p-0" placeholder="$0.00" />
                <hr className="border-gray-200 mt-2" />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Descripción</label>
                <input type="text" required value={formData.description} onChange={handleDescChange} className="w-full border border-gray-200 rounded-xl px-3 py-2 outline-none focus:border-emerald-500" placeholder="Ej. Supermercado, Uber..." />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Categoría</label>
                  <select value={formData.category} onChange={(e) => setFormData({...formData, category: e.target.value})} className="w-full border border-gray-200 rounded-xl px-3 py-2 outline-none focus:border-emerald-500 bg-white">
                    {CATEGORIAS[formData.type].map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Fecha</label>
                  <input type="date" required value={formData.date} onChange={(e) => setFormData({...formData, date: e.target.value})} className="w-full border border-gray-200 rounded-xl px-3 py-2 outline-none focus:border-emerald-500" />
                </div>
              </div>

              <button type="submit" className="w-full bg-emerald-600 text-white font-bold py-3 rounded-xl mt-4 hover:bg-emerald-700">Guardar</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// 3. COACH IA (INTEGRACIÓN GEMINI)
function CoachChat({ txs, isPremium, setView }) {
  const [messages, setMessages] = useState([
    { role: 'ai', text: '¡Hola! Soy Apapoi. ¿En qué puedo ayudarte hoy? Puedes preguntarme cómo reducir gastos o si es buena idea hacer una compra.' }
  ]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  if (!isPremium) return <PremiumLock feature="Coach IA" setView={setView} />;

  const getContexto = () => {
    let ingresos = 0; let gastos = 0;
    const cats = {};
    txs.forEach(t => {
      if (t.type === 'ingreso') ingresos += Number(t.amount);
      else { gastos += Number(t.amount); cats[t.category] = (cats[t.category] || 0) + Number(t.amount); }
    });
    const topCat = Object.keys(cats).sort((a,b)=>cats[b]-cats[a])[0] || 'Ninguna';
    return `Contexto del usuario: Ingresos totales registrados: $${ingresos}. Gastos totales registrados: $${gastos}. Balance: $${ingresos-gastos}. Categoría en la que más gasta: ${topCat}. Sus transacciones recientes incluyen categorías como: ${Object.keys(cats).join(', ')}.`;
  };

  const handleSend = async (e) => {
    e.preventDefault();
    if (!input.trim()) return;

    const userMsg = input.trim();
    setMessages(prev => [...prev, { role: 'user', text: userMsg }]);
    setInput('');
    setIsTyping(true);

    try {
      const apiKey = import.meta.env.VITE_GEMINI_API_KEY || "";
      const systemInstruction = `Eres Apapoi, un asesor financiero personal experto, empático y directo. Respondes brevemente, con viñetas si es necesario. ${getContexto()}`;
      
      const payload = {
        contents: [{ parts: [{ text: userMsg }] }],
        systemInstruction: { parts: [{ text: systemInstruction }] }
      };

      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) throw new Error("Error en la API de Gemini");
      
      const data = await response.json();
      const aiText = data.candidates?.[0]?.content?.parts?.[0]?.text || "Lo siento, no pude procesar eso en este momento.";
      
      setMessages(prev => [...prev, { role: 'ai', text: aiText }]);
    } catch (error) {
      console.error(error);
      setMessages(prev => [...prev, { role: 'ai', text: "Hubo un error de conexión con mi cerebro artificial. Intenta de nuevo más tarde." }]);
    } finally {
      setIsTyping(false);
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] md:h-[calc(100vh-4rem)] max-h-[800px] bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden animate-fadeIn">
      <div className="bg-emerald-600 p-4 text-white flex items-center gap-3 shrink-0">
        <Brain size={24} />
        <div>
          <h2 className="font-bold text-lg leading-tight">Coach IA</h2>
          <p className="text-emerald-100 text-xs">Conectado y analizando tus datos</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50/50">
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[80%] p-3 rounded-2xl text-sm ${
              m.role === 'user' 
                ? 'bg-gray-900 text-white rounded-br-sm' 
                : 'bg-white border border-gray-200 text-gray-800 rounded-bl-sm shadow-sm'
            }`}>
               {m.text.split('**').map((part, index) => index % 2 === 1 ? <strong key={index}>{part}</strong> : part)}
            </div>
          </div>
        ))}
        {isTyping && (
          <div className="flex justify-start">
             <div className="bg-white border border-gray-200 p-4 rounded-2xl rounded-bl-sm shadow-sm flex gap-1">
               <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
               <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{animationDelay: '0.2s'}}></div>
               <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{animationDelay: '0.4s'}}></div>
             </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <form onSubmit={handleSend} className="p-3 bg-white border-t border-gray-100 flex gap-2 shrink-0">
        <input 
          type="text" 
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ej: ¿Puedo permitirme comprar una laptop este mes?" 
          className="flex-1 border border-gray-200 rounded-xl px-4 py-2 outline-none focus:border-emerald-500 text-sm"
        />
        <button type="submit" disabled={isTyping || !input.trim()} className="bg-emerald-600 text-white p-2 px-4 rounded-xl hover:bg-emerald-700 disabled:opacity-50 transition-colors">
          <Send size={20} />
        </button>
      </form>
    </div>
  );
}

// 4. SIMULADOR FINANCIERO
function Simulator({ txs, isPremium, setView }) {
  const [category, setCategory] = useState('');
  const [reduction, setReduction] = useState(20);

  if (!isPremium) return <PremiumLock feature="Simulador Avanzado" setView={setView} />;

  const catsGastos = {};
  txs.forEach(t => { if(t.type === 'gasto') catsGastos[t.category] = (catsGastos[t.category] || 0) + Number(t.amount); });
  const categoriasDisponibles = Object.keys(catsGastos);

  if (!category && categoriasDisponibles.length > 0) setCategory(categoriasDisponibles[0]);

  const gastoActual = catsGastos[category] || 0;
  const ahorroMensual = gastoActual * (reduction / 100);

  return (
    <div className="space-y-6 animate-fadeIn">
      <header>
        <h2 className="text-2xl font-bold text-gray-900">Simulador de Ahorro</h2>
        <p className="text-gray-500">Descubre cuánto podrías ahorrar ajustando tus hábitos.</p>
      </header>

      <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
        {categoriasDisponibles.length === 0 ? (
          <p className="text-gray-500 text-center py-8">Registra gastos primero para usar el simulador.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-6">
              <div>
                <label className="block font-semibold mb-2">1. Selecciona un gasto a reducir</label>
                <select value={category} onChange={(e) => setCategory(e.target.value)} className="w-full border border-gray-200 rounded-xl px-4 py-3 outline-none focus:border-emerald-500">
                  {categoriasDisponibles.map(c => <option key={c} value={c}>{c} ({formatMoney(catsGastos[c])}/mes)</option>)}
                </select>
              </div>
              
              <div>
                <label className="block font-semibold mb-2">2. ¿Cuánto quieres recortar? ({reduction}%)</label>
                <input 
                  type="range" min="0" max="100" step="5" value={reduction} 
                  onChange={(e) => setReduction(e.target.value)} 
                  className="w-full accent-emerald-600" 
                />
                <div className="flex justify-between text-xs text-gray-400 mt-1">
                  <span>0%</span><span>50%</span><span>100%</span>
                </div>
              </div>

              <div className="bg-gray-50 p-4 rounded-xl border border-gray-100">
                <p className="text-sm text-gray-500 mb-1">Tu ahorro mensual estimado:</p>
                <p className="text-3xl font-bold text-emerald-600">+{formatMoney(ahorroMensual)}</p>
              </div>
            </div>

            <div className="bg-emerald-900 text-white p-6 rounded-3xl flex flex-col justify-center">
              <h3 className="font-bold text-xl mb-6 flex items-center gap-2"><Sparkles size={20}/> Proyección a futuro</h3>
              <div className="space-y-4">
                <div className="flex justify-between items-end border-b border-emerald-800 pb-2">
                  <span className="text-emerald-200">En 3 meses</span>
                  <span className="text-2xl font-bold">{formatMoney(ahorroMensual * 3)}</span>
                </div>
                <div className="flex justify-between items-end border-b border-emerald-800 pb-2">
                  <span className="text-emerald-200">En 6 meses</span>
                  <span className="text-2xl font-bold">{formatMoney(ahorroMensual * 6)}</span>
                </div>
                <div className="flex justify-between items-end">
                  <span className="text-emerald-200">En 1 año</span>
                  <span className="text-3xl font-bold text-emerald-400">{formatMoney(ahorroMensual * 12)}</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// 5. METAS (GOALS)
function GoalManager({ goals, user, txs }) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState({ name: '', targetAmount: '', deadline: '' });
  const [generatingId, setGeneratingId] = useState(null);

  const saveGoal = async (e) => {
    e.preventDefault();
    try {
      await addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'goals'), {
        name: formData.name,
        targetAmount: Number(formData.targetAmount),
        deadline: formData.deadline,
        createdAt: new Date().toISOString()
      });
      setIsModalOpen(false);
      setFormData({ name: '', targetAmount: '', deadline: '' });
    } catch (e) { console.error(e); }
  };

  const deleteGoal = async (id) => {
    await deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'goals', id));
  };

  let totalSaved = 0;
  txs.forEach(t => { totalSaved += (t.type === 'ingreso' ? Number(t.amount) : -Number(t.amount)); });
  if (totalSaved < 0) totalSaved = 0;

  const generateAIPlan = async (goal) => {
    setGeneratingId(goal.id);
    try {
      const apiKey = import.meta.env.VITE_GEMINI_API_KEY || "";
      const prompt = `Tengo una meta financiera: "${goal.name}". Mi objetivo es juntar $${goal.targetAmount} para la fecha límite del ${new Date(goal.deadline).toLocaleDateString()}. Actualmente tengo disponible $${totalSaved}. Crea un plan de acción rápido y motivador con 3 a 4 pasos específicos en viñetas para ayudarme a lograrlo. Evita introducciones largas, ve directo a los consejos.`;
      
      const payload = {
        contents: [{ parts: [{ text: prompt }] }],
        systemInstruction: { parts: [{ text: "Eres Apapoi, un coach financiero proactivo y analítico. Das respuestas accionables y concretas." }] }
      };

      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) throw new Error("API Error");
      const data = await response.json();
      const aiPlan = data.candidates?.[0]?.content?.parts?.[0]?.text || "No se pudo generar el plan. Intenta nuevamente.";
      
      await updateDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'goals', goal.id), {
        aiPlan: aiPlan
      });
    } catch (error) {
      console.error(error);
    } finally {
      setGeneratingId(null);
    }
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-gray-900">Mis Metas</h2>
        <button onClick={() => setIsModalOpen(true)} className="bg-gray-900 text-white px-4 py-2 rounded-xl text-sm font-medium flex items-center gap-2">
          <Plus size={16} /> Crear Meta
        </button>
      </div>

      <div className="grid grid-cols-1 gap-6">
        {goals.map(goal => {
          const progress = Math.min((totalSaved / goal.targetAmount) * 100, 100);
          return (
            <div key={goal.id} className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 relative group">
              <button onClick={() => deleteGoal(goal.id)} className="absolute top-6 right-6 text-gray-300 hover:text-red-500 hidden md:block group-hover:block transition-colors"><Trash2 size={20}/></button>
              
              <div className="md:w-2/3">
                <h3 className="font-bold text-xl mb-1">{goal.name}</h3>
                <p className="text-sm text-gray-500 mb-6">Meta: {formatMoney(goal.targetAmount)} • Fecha: {new Date(goal.deadline).toLocaleDateString()}</p>
                
                <div className="w-full bg-gray-100 rounded-full h-3 mb-2 overflow-hidden">
                  <div className={`h-full rounded-full transition-all duration-500 ${progress >= 100 ? 'bg-emerald-500' : 'bg-blue-500'}`} style={{ width: `${progress}%` }}></div>
                </div>
                <div className="flex justify-between text-xs font-medium mb-6">
                  <span className={progress >= 100 ? 'text-emerald-600' : 'text-blue-600'}>{progress.toFixed(0)}% completado</span>
                  <span className="text-gray-400">Restan {formatMoney(Math.max(goal.targetAmount - totalSaved, 0))}</span>
                </div>
              </div>

              <div className="mt-4 pt-6 border-t border-gray-100">
                {goal.aiPlan ? (
                  <div className="bg-emerald-50/50 p-5 rounded-2xl text-sm text-gray-800 border border-emerald-100">
                    <h4 className="font-bold text-emerald-900 flex items-center gap-2 mb-3">
                      <Sparkles size={18} className="text-emerald-600"/> Plan de Acción Inteligente
                    </h4>
                    <div className="space-y-2 leading-relaxed">
                      {goal.aiPlan.split('\n').map((line, i) => (
                        <p key={i}>{line.split('**').map((part, index) => index % 2 === 1 ? <strong key={index}>{part}</strong> : part)}</p>
                      ))}
                    </div>
                  </div>
                ) : (
                  <button 
                    onClick={() => generateAIPlan(goal)} 
                    disabled={generatingId === goal.id}
                    className="w-full md:w-auto flex items-center justify-center gap-2 py-3 px-6 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded-xl text-sm font-bold transition-colors border border-emerald-200 disabled:opacity-50"
                  >
                    {generatingId === goal.id ? <Loader2 size={18} className="animate-spin" /> : <Sparkles size={18} />}
                    {generatingId === goal.id ? 'Analizando tu meta...' : '✨ Generar Plan de Acción IA'}
                  </button>
                )}
              </div>
            </div>
          )
        })}
        {goals.length === 0 && (
          <div className="col-span-full p-10 text-center text-gray-500 bg-white rounded-3xl border border-dashed border-gray-300">
             <Target size={48} className="mx-auto mb-4 text-gray-300" />
             <p className="text-lg">Aún no tienes metas financieras. ¡Crea la primera y genera un plan con IA!</p>
          </div>
        )}
      </div>

       {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl w-full max-w-md p-6 shadow-xl animate-scaleIn">
             <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold">Nueva Meta</h3>
              <button onClick={() => setIsModalOpen(false)}><X size={24}/></button>
            </div>
            <form onSubmit={saveGoal} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">¿Qué quieres lograr?</label>
                <input type="text" required value={formData.name} onChange={e=>setFormData({...formData, name: e.target.value})} className="w-full border border-gray-200 rounded-xl px-4 py-3 outline-none focus:border-emerald-500" placeholder="Ej. Viaje a Japón" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Monto necesario</label>
                <input type="number" required value={formData.targetAmount} onChange={e=>setFormData({...formData, targetAmount: e.target.value})} className="w-full border border-gray-200 rounded-xl px-4 py-3 outline-none focus:border-emerald-500" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Fecha límite</label>
                <input type="date" required value={formData.deadline} onChange={e=>setFormData({...formData, deadline: e.target.value})} className="w-full border border-gray-200 rounded-xl px-4 py-3 outline-none focus:border-emerald-500" />
              </div>
              <button type="submit" className="w-full bg-emerald-600 text-white font-bold py-4 rounded-xl hover:bg-emerald-700 mt-4">Crear Meta</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// 6. AJUSTES (SETTINGS)
function SettingsView({ user, isPremium, setIsPremium }) {
  return (
    <div className="space-y-6 max-w-2xl animate-fadeIn">
      <h2 className="text-2xl font-bold text-gray-900">Ajustes</h2>
      
      <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden divide-y divide-gray-100">
        <div className="p-6">
          <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-4">Perfil</h3>
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center text-2xl font-bold text-emerald-700">
              {user.displayName?.charAt(0) || 'U'}
            </div>
            <div>
              <p className="font-bold text-xl">{user.displayName}</p>
              <p className="text-gray-500 text-sm">ID: {user.uid.substring(0,8)}...</p>
            </div>
          </div>
        </div>

        <div className="p-6">
          <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-4">Suscripción</h3>
          <div className="flex items-center justify-between p-4 rounded-2xl bg-gray-50 border border-gray-200">
            <div>
              <p className="font-bold flex items-center gap-2">
                Plan Actual: {isPremium ? <span className="text-yellow-600 flex items-center gap-1"><Crown size={16}/> Premium</span> : 'Gratis'}
              </p>
              <p className="text-sm text-gray-500 mt-1">
                {isPremium ? 'Tienes acceso completo a todas las herramientas IA.' : 'Funciones básicas de registro y análisis.'}
              </p>
            </div>
            <button 
              onClick={() => setIsPremium(!isPremium)}
              className={`px-4 py-2 rounded-xl font-medium transition-colors ${isPremium ? 'bg-gray-200 text-gray-700 hover:bg-gray-300' : 'bg-yellow-400 text-yellow-900 hover:bg-yellow-500'}`}
            >
              {isPremium ? 'Cancelar' : 'Upgrade Premium'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// 7. REGLA 33.3%
function Rule33View({ txs }) {
  const [customIncome, setCustomIncome] = useState('');

  const currentMonth = new Date().getMonth();
  const currentYear = new Date().getFullYear();

  const monthlyIncome = useMemo(() => {
    return txs.reduce((acc, tx) => {
      const d = new Date(tx.date);
      if (tx.type === 'ingreso' && d.getMonth() === currentMonth && d.getFullYear() === currentYear) {
        return acc + Number(tx.amount);
      }
      return acc;
    }, 0);
  }, [txs, currentMonth, currentYear]);

  const baseIncome = customIncome !== '' ? Number(customIncome) : monthlyIncome;
  const third = baseIncome / 3;

  return (
    <div className="space-y-6 animate-fadeIn">
      <header>
        <h2 className="text-2xl font-bold text-gray-900">Regla de los Tercios (33.3%)</h2>
        <p className="text-gray-500">Divide tus ingresos en tres partes iguales para mantener un presupuesto saludable y sin estrés.</p>
      </header>

      <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
        <div className="mb-8">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Ingreso a calcular (Usa tu ingreso mensual registrado o ingresa un monto manual)
          </label>
          <div className="flex items-center gap-2 max-w-md">
            <span className="text-gray-500 font-bold text-xl">$</span>
            <input
              type="number"
              value={customIncome !== '' ? customIncome : (monthlyIncome > 0 ? monthlyIncome : '')}
              onChange={(e) => setCustomIncome(e.target.value)}
              placeholder="Ej. 1000000"
              className="w-full border border-gray-200 rounded-xl px-4 py-3 outline-none focus:border-emerald-500 text-xl font-bold text-gray-900"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-blue-50 p-6 rounded-2xl border border-blue-100 relative overflow-hidden">
            <h3 className="font-bold text-blue-900 mb-2 flex items-center gap-2">🏠 Necesidades</h3>
            <p className="text-sm text-blue-700 mb-4">Alquiler, supermercado, servicios, salud y transporte.</p>
            <p className="text-3xl font-bold text-blue-600">{formatMoney(third)}</p>
            <div className="absolute top-4 right-4 bg-blue-200 text-blue-800 text-xs font-bold px-2 py-1 rounded-lg">33.3%</div>
          </div>

          <div className="bg-emerald-50 p-6 rounded-2xl border border-emerald-100 relative overflow-hidden">
            <h3 className="font-bold text-emerald-900 mb-2 flex items-center gap-2">🎯 Ahorro / Inversión</h3>
            <p className="text-sm text-emerald-700 mb-4">Fondo de emergencia, inversiones y ahorro para metas.</p>
            <p className="text-3xl font-bold text-emerald-600">{formatMoney(third)}</p>
            <div className="absolute top-4 right-4 bg-emerald-200 text-emerald-800 text-xs font-bold px-2 py-1 rounded-lg">33.3%</div>
          </div>

          <div className="bg-purple-50 p-6 rounded-2xl border border-purple-100 relative overflow-hidden">
            <h3 className="font-bold text-purple-900 mb-2 flex items-center gap-2">🏖️ Estilo de Vida</h3>
            <p className="text-sm text-purple-700 mb-4">Salidas, delivery, gustos, ropa y entretenimiento.</p>
            <p className="text-3xl font-bold text-purple-600">{formatMoney(third)}</p>
            <div className="absolute top-4 right-4 bg-purple-200 text-purple-800 text-xs font-bold px-2 py-1 rounded-lg">33.3%</div>
          </div>
        </div>
      </div>
    </div>
  );
}

// --- COMPONENTE UTILITARIO ---
function PremiumLock({ feature, setView }) {
  return (
    <div className="h-full flex items-center justify-center text-center px-4 animate-fadeIn">
      <div className="max-w-md w-full bg-white p-8 rounded-3xl shadow-sm border border-gray-100 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-yellow-400 to-yellow-600"></div>
        <Crown size={48} className="mx-auto text-yellow-500 mb-4" />
        <h2 className="text-2xl font-bold mb-2">Descubre {feature}</h2>
        <p className="text-gray-500 mb-6">
          Esta es una funcionalidad exclusiva para miembros Premium. Obtén análisis avanzado, simulaciones y asistencia de IA 24/7.
        </p>
        <button onClick={() => setView('settings')} className="bg-gray-900 text-white font-bold py-3 px-8 rounded-xl hover:bg-gray-800 transition-colors">
          Ver Planes Premium
        </button>
      </div>
    </div>
  );
}