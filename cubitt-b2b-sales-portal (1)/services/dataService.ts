
import { Product, ProductVariant } from '../types';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';

// Definición laxa para permitir normalización dinámica de columnas
interface DataRow {
  [key: string]: any;
}

const processRawRows = (rows: DataRow[]): Product[] => {
  const productMap: Record<string, Product> = {};

  // Helper: Encuentra el valor de una columna buscando por varias posibles claves (insensible a mayúsculas/símbolos)
  const getValue = (row: DataRow, possibleKeys: string[]): string => {
    const rowKeys = Object.keys(row);
    
    for (const key of possibleKeys) {
      // 1. Intento exacto
      if (row[key] !== undefined && row[key] !== null && String(row[key]).trim() !== '') {
        return String(row[key]).trim();
      }
      
      // 2. Intento normalizado (sin espacios, sin guiones, minúsculas)
      const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]/g, '');
      const foundRowKey = rowKeys.find(k => k.toLowerCase().replace(/[^a-z0-9]/g, '') === normalizedKey);
      
      if (foundRowKey && row[foundRowKey] !== undefined && row[foundRowKey] !== null && String(row[foundRowKey]).trim() !== '') {
        return String(row[foundRowKey]).trim();
      }
    }
    return '';
  };

  rows.forEach((row) => {
    // 1. Identificar Producto (Handle)
    const handle = getValue(row, ['Handle', 'ID', 'Product Handle']);
    if (!handle) return; // Fila inválida si no tiene handle

    // 2. Extraer Datos con Prioridad
    // Prioridad de Imagen: Variant Image (Específica) > Image Src (Estándar) > Image (Genérica)
    const image = getValue(row, ['Variant Image', 'Image Src', 'Image', 'Imagen', 'Photo']);
    
    const priceStr = getValue(row, ['Price', 'Variant Price', 'Precio']);
    const price = parseFloat(priceStr.replace(/[^0-9.]/g, '')) || 0;
    
    const comparePriceStr = getValue(row, ['Compare At Price', 'Compare Price']);
    const comparePrice = comparePriceStr ? parseFloat(comparePriceStr.replace(/[^0-9.]/g, '')) : undefined;
    
    const inventoryStr = getValue(row, ['Inventory', 'Variant Inventory Qty', 'Stock', 'Qty']);
    const inventory = parseInt(inventoryStr, 10) || 0;

    let color = getValue(row, ['Option1 Value', 'Color', 'Colour', 'Option1', 'Variante']);
    // Filtro para eliminar "Default" o "Default Title" (común en exports de Shopify)
    if (!color || color.toLowerCase() === 'default' || color.toLowerCase() === 'default title') {
      color = 'Único';
    }

    // Generar SKU por defecto si no existe
    const defaultSku = `${handle}-${color.replace(/\s+/g, '')}`; 
    const sku = getValue(row, ['SKU', 'Variant SKU', 'Part Number']) || defaultSku;

    const title = getValue(row, ['Title', 'Product Name', 'Nombre']) || handle;
    const type = getValue(row, ['Type', 'Product Type', 'Category', 'Categoria']) || 'General';
    const description = getValue(row, ['Body (HTML)', 'Description', 'Descripción']) || '';
    const tags = getValue(row, ['Tags', 'Etiquetas']);
    const vendor = getValue(row, ['Vendor', 'Marca']) || 'Cubitt';

    // 3. Crear o Actualizar Producto Padre
    if (!productMap[handle]) {
      productMap[handle] = {
        id: handle,
        handle: handle,
        title: title.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '), // Formato Título
        description: description,
        vendor: vendor,
        category: type,
        type: type,
        mainImage: image, // Se intentará llenar con la primera imagen encontrada
        tags: tags ? tags.split(',').map(t => t.trim()) : [],
        variants: [],
        isOutOfStock: false,
        isBestSeller: tags.toLowerCase().includes('best seller'),
        isSale: tags.toLowerCase().includes('sale') || !!comparePrice,
      };
    }

    // 4. Gestionar Variantes
    const product = productMap[handle];
    const existingVariant = product.variants.find(v => v.sku === sku);

    if (!existingVariant) {
      // Nueva variante
      product.variants.push({
        sku: sku,
        option1: color,
        price: price,
        compareAtPrice: comparePrice,
        inventory: inventory,
        image: image || product.mainImage // Si la variante no tiene imagen propia, usa la del padre (temporalmente)
      });
    } else {
      // Variante existente: Actualizar imagen si la fila actual tiene una mejor (ej. Variant Image específica)
      if (!existingVariant.image && image) {
        existingVariant.image = image;
      }
    }
  });

  // 5. Post-procesamiento y Limpieza
  return Object.values(productMap).map(product => {
    // Si el producto padre no tiene imagen, usar la de la primera variante que tenga
    if (!product.mainImage) {
      const firstVariantWithImage = product.variants.find(v => v.image);
      if (firstVariantWithImage) {
        product.mainImage = firstVariantWithImage.image;
      }
    }
    
    // Asegurar que todas las variantes tengan al menos la imagen del padre si les falta la suya
    product.variants.forEach(v => {
      if (!v.image) v.image = product.mainImage;
    });

    const totalStock = product.variants.reduce((acc, v) => acc + v.inventory, 0);
    
    return {
      ...product,
      isOutOfStock: totalStock <= 0,
      restockingSoon: totalStock <= 10 && totalStock > 0
    };
  });
};

export const parseCSVToProducts = (csvText: string): Promise<Product[]> => {
  return new Promise((resolve, reject) => {
    Papa.parse(csvText, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        try {
          resolve(processRawRows(results.data as DataRow[]));
        } catch (e) {
          reject(e);
        }
      },
      error: (error: any) => reject(error)
    });
  });
};

export const parseExcelToProducts = (arrayBuffer: ArrayBuffer): Product[] => {
  const workbook = XLSX.read(arrayBuffer, { type: 'array' });
  const firstSheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[firstSheetName];
  // SheetJS extrae valores de celda. Las imágenes deben venir como URLs en columnas como 'Image Src' o 'Variant Image'.
  const rows = XLSX.utils.sheet_to_json(worksheet);
  return processRawRows(rows as DataRow[]);
};

export const fetchProductsFromUrl = async (url: string): Promise<Product[]> => {
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error('Error al descargar el archivo');
    const text = await response.text();
    return parseCSVToProducts(text);
  } catch (error) {
    console.error("Error fetching data:", error);
    throw error;
  }
};
