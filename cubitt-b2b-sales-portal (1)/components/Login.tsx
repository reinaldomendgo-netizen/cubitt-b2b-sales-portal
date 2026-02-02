
import React, { useState, useRef } from 'react';
import { User, Product } from '../types';

interface LoginProps {
  onLogin: (user: User, products: Product[]) => void;
}

// Helpers de lectura de archivo
const readFileAsText = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target?.result as string);
    reader.onerror = (e) => reject(e);
    reader.readAsText(file);
  });
};

const readFileAsArrayBuffer = (file: File): Promise<ArrayBuffer> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target?.result as ArrayBuffer);
    reader.onerror = (e) => reject(e);
    reader.readAsArrayBuffer(file);
  });
};

const Login: React.FC<LoginProps> = ({ onLogin }) => {
  const [companyName, setCompanyName] = useState('');
  const [loading, setLoading] = useState(false);
  const [fileName, setFileName] = useState('');
  const [loadedProducts, setLoadedProducts] = useState<Product[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setFileName(file.name);
    try {
      let newProducts: Product[] = [];
      const fName = file.name.toLowerCase();

      // Importación dinámica del servicio
      const { parseCSVToProducts, parseExcelToProducts } = await import('../services/dataService');

      if (fName.endsWith('.csv')) {
        const text = await readFileAsText(file);
        newProducts = await parseCSVToProducts(text);
      } else if (fName.endsWith('.xlsx') || fName.endsWith('.xls')) {
        const buffer = await readFileAsArrayBuffer(file);
        newProducts = parseExcelToProducts(buffer);
      } else {
        throw new Error('Formato no soportado. Usa .csv, .xlsx o .xls');
      }

      // FILTRO CRÍTICO: Solo productos con stock > 0
      const availableProducts = newProducts.filter(p => !p.isOutOfStock);

      if (availableProducts.length === 0) {
        throw new Error('El archivo no contiene productos con inventario disponible.');
      }
      
      setLoadedProducts(availableProducts);
    } catch (err: any) {
      alert(`Error al procesar archivo: ${err.message || 'Formato inválido'}`);
      setFileName('');
      setLoadedProducts([]);
      if (fileInputRef.current) fileInputRef.current.value = '';
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyName.trim()) {
      alert('Por favor ingrese el nombre de la empresa.');
      return;
    }
    if (loadedProducts.length === 0) {
      alert('Por favor adjunte un archivo de inventario válido.');
      return;
    }

    onLogin({
      id: `CUST-${Date.now().toString().slice(-4)}`,
      companyName: companyName,
      email: 'contacto@cliente.com', // Default placeholder
      taxId: '', // Optional now
      authorized: true,
      contractUpdateDate: new Date().toLocaleDateString('es-PA')
    }, loadedProducts);
  };

  return (
    <div className="min-h-screen bg-[#F5F5F7] flex flex-col items-center justify-center p-4">
      <div className="bg-white p-10 md:p-12 rounded-[40px] shadow-2xl w-full max-w-[450px] border border-black/5 animate-in fade-in zoom-in-95 duration-500">
        <div className="mb-10 text-center">
          <div className="bg-black text-white w-14 h-14 rounded-[18px] flex items-center justify-center mx-auto mb-6 shadow-lg">
            <span className="material-icons text-2xl">layers</span>
          </div>
          <h1 className="text-2xl font-black uppercase tracking-tighter text-black">Cubitt B2B</h1>
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.2em] mt-2">Carga de Inventario</p>
        </div>
        
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-[9px] font-black uppercase tracking-widest text-gray-400 mb-2 ml-2">Nombre de la Empresa</label>
            <input 
              className="w-full bg-[#F5F5F7] border-none rounded-xl py-4 px-5 text-sm font-medium text-black focus:ring-2 focus:ring-black/5 placeholder-gray-400 transition-all" 
              placeholder="Ej. Fit Solution S.A." 
              required 
              type="text"
              value={companyName}
              onChange={e => setCompanyName(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-[9px] font-black uppercase tracking-widest text-gray-400 mb-2 ml-2">Archivo de Catálogo</label>
            <div 
              onClick={() => fileInputRef.current?.click()}
              className={`w-full border-2 border-dashed rounded-xl py-6 px-4 text-center cursor-pointer transition-all flex flex-col items-center justify-center gap-2 group ${
                fileName ? 'border-green-500 bg-green-50' : 'border-gray-200 hover:border-black/20 bg-[#F5F5F7] hover:bg-gray-100'
              }`}
            >
               {loading ? (
                 <span className="material-icons animate-spin text-gray-400">refresh</span>
               ) : fileName ? (
                 <>
                   <span className="material-icons text-green-600 text-3xl">check_circle</span>
                   <div className="text-sm font-bold text-green-800 break-all px-4">{fileName}</div>
                   <div className="text-[10px] font-bold text-green-600 uppercase tracking-widest">{loadedProducts.length} Items Disponibles</div>
                 </>
               ) : (
                 <>
                   <span className="material-icons text-gray-300 text-3xl group-hover:text-black transition-colors">upload_file</span>
                   <div className="text-xs font-bold text-gray-400 group-hover:text-black">Click para adjuntar CSV / Excel</div>
                   <div className="text-[8px] text-gray-400 uppercase tracking-widest">Solo productos con stock</div>
                 </>
               )}
            </div>
            <input 
              type="file" 
              accept=".csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel" 
              ref={fileInputRef} 
              className="hidden" 
              onChange={handleFileUpload}
            />
          </div>

          <div className="pt-4">
             <button 
                type="submit"
                disabled={!companyName || loadedProducts.length === 0 || loading}
                className="w-full bg-black text-white py-4 rounded-xl font-black text-[10px] uppercase tracking-[0.2em] hover:scale-[1.02] active:scale-95 transition-all shadow-xl hover:shadow-2xl disabled:opacity-50 disabled:scale-100 disabled:shadow-none"
             >
                Generar Catálogo
             </button>
          </div>
        </form>
        
        <div className="mt-8 text-center">
            <p className="text-[8px] text-gray-300 font-medium uppercase tracking-widest">Solo se mostrará inventario disponible</p>
        </div>
      </div>
    </div>
  );
};

export default Login;
