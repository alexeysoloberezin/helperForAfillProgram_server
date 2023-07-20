const express = require('express');
const app = express();
const port = 1223;
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const axios = require('axios')
const url = require('url');
const archiver = require('archiver');

app.use(express.json({ limit: '10mb' }));
app.use(cors());

app.get('/', (req, res) => {
  res.send('Привет, мир!');
});

async function convertImagesToWebP() {
  const sourceDir = './img/source';
  const webpDir = './img/webp';

  // Проверяем наличие директории source
  if (!fs.existsSync(sourceDir)) {
    console.error('Директория source не существует');
    return;
  }

  // Создаем директорию webp, если она не существует
  if (!fs.existsSync(webpDir)) {
    fs.mkdirSync(webpDir);
  }

  // Получаем список файлов в директории source
  const files = fs.readdirSync(sourceDir);

  for (const file of files) {
    try {
      const inputFilePath = path.join(sourceDir, file);
      const outputFileName = file.replace('.png', '.webp');
      const outputFilePath = path.join(webpDir, outputFileName);

      await sharp(inputFilePath).toFormat('webp').toFile(outputFilePath);
      console.log(`Изображение ${file} успешно конвертировано в ${outputFileName}`);
    } catch (error) {
      console.error(`Ошибка при конвертации изображения ${file}:`, error);
    }
  }

  console.log('Все изображения успешно конвертированы в формат WebP');
}

// Получаем путь к исходному файлу PNG
app.get('/convert', async (req, res) => {
  try {
    const inputFilePath = 'img23.png';
    const convertedFilePath = await convertImage(inputFilePath);
    res.send(`Изображение успешно конвертировано. Путь к файлу WebP: ${convertedFilePath}`);
  } catch (err) {
    console.error(err);
    res.status(500).send('Произошла ошибка при конвертации изображения');
  }
});

app.post('/getInfo', async (req, res) => {
  try {
    let {name, offerCards, nameImage, convertToWebp, removeImages} = req.body
    if(!offerCards) return res.status(500).send(
      {err: 'offerCards is required'});
    offerCards = JSON.parse(req.body.offerCards); // Получаем данные из свойства offerCards в JSON-теле запроса
    if(!name) return res.status(500).send({err: 'name is reqired'});
    if(!Array.isArray(offerCards)) return res.status(500).send({err: 'offerCards not object/array'});

    if(removeImages){
      try {
        const directories = ['./img/source', './img/webp'];
        deleteFilesFromDirectories(directories);
      } catch (error) {
        console.error('Ошибка при удалении файлов:', error);
        res.status(500).send('Произошла ошибка при удалении файлов');
      }
    }

    let filtered = offerCards.filter((card) => card.title.toLowerCase().includes(name.toLowerCase()))
    if(filtered.length === 0) return res.status(500).send({err: 'not fount name in Array cards: ' + name});


    filtered = filtered.map(item => {
        return {
          img: 'https://agents.pampadu.ru' + item.icon,
          title: item.title,
          commission: item.commission
        }
      })
    filtered = filtered.sort((a, b) => {
      console.log(typeof a.commission)

      const commisionA = parseFloat(a.commission); // Преобразуем значение commision в число
      const commisionB = parseFloat(b.commission);

      return commisionA - commisionB; // Сравниваем значения числового commision
    })
    console.log(filtered)
    await Promise.all(filtered.map(async (item, index) => {
      await saveImageFromUrl(item.img,nameImage || name, index + 1)
    }));

    let imageNames = fs.readdirSync('./img/source')

    if(convertToWebp){
      await convertImagesToWebP()
      imageNames = fs.readdirSync('./img/webp')
    }

    res.send( {
      data: filtered,
      type: typeof offerCards,
      name: req.body.name,
      imagesReady: true,
      imagesName: imageNames
    });
    // Делайте необходимую обработку данных
  } catch (err) {
    console.error(err);
    res.status(500).send({err: 'ERROR MAIN'});
  }
});

app.get('/downloadImage', (req, res) => {
  const archive = archiver('zip', {
    zlib: { level: 9 } // Уровень сжатия
  });

  // Устанавливаем заголовок ответа для скачивания архива
  res.attachment('images.zip');

  // Передаем поток архива в ответ
  archive.pipe(res);

  // Добавляем папку webp в архив
  archive.directory('./img/webp', 'webp');

  // Добавляем папку source (с картинками png) в архив
  archive.directory('./img/source', 'png');

  // Завершаем архивацию и отправляем архив в ответ
  archive.finalize((err) => {
    if (err) {
      console.error('Ошибка при создании архива:', err);
      return res.status(500).send('Ошибка при создании архива');
    }

    console.log('Архив успешно создан и отправлен в ответ');
  });
});

function separateNumberWithUnderscore(number) {
  return number.toLocaleString('en-US').replace(/,/g, '_');
}
async function saveImageFromUrl(imageUrl, name, index) {
  try {
    const response = await axios.get(imageUrl, { responseType: 'arraybuffer' });
    const imageBuffer = Buffer.from(response.data, 'binary');

    const imageName = `${name}_${index}`;
    const imagePath = path.join('./img/source', imageName);

    // Явно указываем тип файла как .png
    const imageExtension = '.png';
    const imagePathWithExtension = imagePath.endsWith(imageExtension) ? imagePath : `${imagePath}${imageExtension}`;

    // Создаем директорию, если она не существует
    if (!fs.existsSync('./img/source')) {
      fs.mkdirSync('./img/source', { recursive: true });
    }

    fs.writeFileSync(imagePathWithExtension, imageBuffer);
    console.log('Изображение успешно сохранено:', imageName);
    return imagePathWithExtension;
  } catch (error) {
    console.error('Ошибка при сохранении изображения:', error);
    throw error;
  }
}

function deleteFilesFromDirectories(directories) {
  directories.forEach((directory) => {
    if (fs.existsSync(directory)) {
      const files = fs.readdirSync(directory);
      files.forEach((file) => {
        const filePath = path.join(directory, file);
        fs.unlinkSync(filePath);
        console.log('Удален файл:', filePath);
      });
    }
  });
}

app.listen(port, () => {
  console.log(`Сервер запущен на порту ${port}`);
});
