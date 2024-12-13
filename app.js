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
    const allColumns = new Set(); // Aquí guardaremos todas las columnas únicas

    zipEntries.forEach((entry) => {
      if (entry.entryName.endsWith('.json')) {
        // Leer y procesar solo los archivos JSON
        const jsonData = JSON.parse(zip.readAsText(entry));
        const flattenedData = flattenJson(jsonData); // Aplana el JSON
        allData.push(flattenedData);

        // Agregar las claves del JSON a las columnas únicas
        Object.keys(flattenedData).forEach((key) => allColumns.add(key));
      }
    });

    // Si no se encontraron JSON en el ZIP, devolver un error
    if (allData.length === 0) {
      return res.status(400).send('El archivo ZIP no contiene JSON válidos.');
    }

    // Generar las filas para el Excel
    const rows = [Array.from(allColumns)]; // Encabezados
    allData.forEach((data) => {
      const row = Array.from(allColumns).map((col) => data[col] ?? ''); // Agregar valores o dejar en blanco
      rows.push(row);
    });

    // Crear un libro de trabajo y hoja de cálculo
    const workbook = xlsx.utils.book_new();
    const worksheet = xlsx.utils.aoa_to_sheet(rows);
    xlsx.utils.book_append_sheet(workbook, worksheet, 'Datos');

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
      downloadUrl: `http://localhost:${PORT}/processed/archivo_procesado.xlsx`,
    });
  } catch (error) {
    console.error(error.message);
    res.status(500).send(`Error procesando el archivo: ${error.message}`);
  }
});

// Función para aplanar un JSON
const flattenJson = (data, prefix = '') => {
  const result = {};

  for (const key in data) {
    if (data[key] !== null && typeof data[key] === 'object' && !Array.isArray(data[key])) {
      // Si es un objeto, aplanar sus propiedades con un prefijo
      Object.assign(result, flattenJson(data[key], `${prefix}${key}_`));
    } else if (Array.isArray(data[key])) {
      // Si es un array, concatenar los valores como una cadena
      result[`${prefix}${key}`] = JSON.stringify(data[key]);
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
