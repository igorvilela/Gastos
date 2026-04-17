export interface Expense {
  id: string;
  name: string;
  amount: number;
  category: string;
  date: string;
  description?: string;
  installment?: {
    current: number;
    total: number;
    groupId: string;
  };
}

export type FlyerTheme = 'default' | 'rock' | 'love' | 'minimal' | 'techno';

export interface FlyerConfig {
  title: string;
  subtitle: string;
  primaryColor: string;
  secondaryColor: string;
  backgroundColor: string;
  fontFamily: 'serif' | 'sans' | 'mono';
  layout: 'centered' | 'split' | 'minimal';
  theme: FlyerTheme;
  colors?: {
    fixos: string;
    variaveis: string;
    prazeres: string;
    income: string;
  };
}

export type Category = 'Fixos' | 'Variáveis' | 'Prazeres' | 'Reserva' | 'Cartão de Crédito';
