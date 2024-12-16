const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const xlsx = require('xlsx'); // Librería para Excel
const AdmZip = require('adm-zip'); // Librería para ZIP

const app = express();

// Middleware para habilitar CORS
app.use(cors());

// Configuración del almacenamiento con Multer
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = 'uploads/';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir); // Directorio donde se almacenan los archivos
  },
  filename: function (req, file, cb) {
    const uniqueName = `${Date.now()}-${file.originalname}`;
    cb(null, uniqueName); // Nombre único para evitar conflictos
  },
});

const upload = multer({ storage: storage });

// Sirve la carpeta "public" como carpeta estática
app.use(express.static(path.join(__dirname, 'public')));

// Redirigir la raíz ("/") al archivo index.html automáticamente
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Ruta para subir archivos ZIP y generar el Excel dinámico
app.post('/upload', upload.single('file'), (req, res) => {
  try {
    // Verifica si se subió un archivo
    if (!req.file) {
      return res.status(400).send('No se ha subido ningún archivo.');
    }

    const filePath = req.file.path; // Ruta del archivo subido
    const fileExtension = path.extname(req.file.originalname).toLowerCase();

    // Validar si el archivo es un ZIP
    if (fileExtension !== '.zip') {
      return res.status(400).send('El archivo subido no es un archivo ZIP válido.');
    }

    // Extraer el contenido del ZIP
    const zip = new AdmZip(filePath);
    const zipEntries = zip.getEntries(); // Obtén los archivos dentro del ZIP

    const allData = []; // Aquí guardaremos los datos combinados

    zipEntries.forEach((entry) => {
      if (entry.entryName.endsWith('.json')) {
        // Leer y procesar solo los archivos JSON
        const jsonData = JSON.parse(zip.readAsText(entry));
        const rows = flattenAndExpandJson(jsonData); // Aplana y expande el JSON
        allData.push(...rows); // Agregar todas las filas procesadas
      }
    });

    // Si no se encontraron JSON en el ZIP, devolver un error
    if (allData.length === 0) {
      return res.status(400).send('El archivo ZIP no contiene JSON válidos.');
    }

    // Crear un libro de trabajo y hoja de cálculo
    const workbook = xlsx.utils.book_new();
    const worksheet = xlsx.utils.json_to_sheet(allData);
    xlsx.utils.book_append_sheet(workbook, worksheet, 'Datossss');

    const processedDir = 'processed/';
    if (!fs.existsSync(processedDir)) {
      fs.mkdirSync(processedDir, { recursive: true });
    }

    const processedFilePath = path.join(processedDir, 'archivo_procesado.xlsx');

    // Escribir el archivo Excel en el sistema de archivos
    xlsx.writeFile(workbook, processedFilePath);

    // Devuelve la URL para descargar el archivo procesado
    res.json({
      message: 'Archivo procesado exitosamente.',
      downloadUrl: `https://proyect-w8sl.onrender.com/processed/archivo_procesado.xlsx`,
    });
  } catch (error) {
    console.error(error.message);
    res.status(500).send(`Error procesando el archivo: ${error.message}`);
  }
});

// Función para aplanar y expandir un JSON con filas por producto
const flattenAndExpandJson = (data) => {
  const rows = [];

  // Extraer productos y generar filas por cada producto
  data.products.forEach((product) => {
    product.items.forEach((item) => {
      const flattened = flattenJson(data); // Aplanar el JSON principal
      delete flattened.products; // Eliminar el array original de productos

      // Agregar información específica del producto e ítem
      flattened.product_name = product.name;
      flattened.product_price = product.price;
      flattened.product_quantity = product.quantity;
      flattened.item_code = item.code;
      flattened.item_name = item.name;
      flattened.item_price = item.price;
      flattened.item_quantity = item.quantity;

      rows.push(flattened);
    });
  });

  return rows;
};

// Función para aplanar un JSON
const flattenJson = (data, prefix = '') => {
  const result = {};

  for (const key in data) {
    if (data[key] !== null && typeof data[key] === 'object' && !Array.isArray(data[key])) {
      // Si es un objeto, aplanar sus propiedades con un prefijo
      Object.assign(result, flattenJson(data[key], `${prefix}${key}_`));
    } else if (Array.isArray(data[key])) {
      // Ignorar arrays (procesados en otra función)
      continue;
    } else {
      // Si es un valor primitivo, añadirlo directamente
      result[`${prefix}${key}`] = data[key] ?? ''; // Solo asigna '' si el valor es null o undefined
    }
  }

  return result;
};

// Servir los archivos procesados para su descarga
app.use('/processed', express.static('processed'));

// Servidor escuchando
const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Servidor escuchando en http://localhost:${PORT}`);
});
