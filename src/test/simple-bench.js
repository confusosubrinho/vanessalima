
async function mockCompress(file, delay) {
  await new Promise(r => setTimeout(r, delay));
  return { file, fileName: `webp-${file.name}` };
}

async function mockUpload(delay) {
  await new Promise(r => setTimeout(r, delay));
  return { error: null };
}

async function sequential(files, delay) {
  const newMedia = [];
  for (const file of files) {
    await mockCompress(file, delay);
    await mockUpload(delay);
    newMedia.push({ id: Math.random(), order: newMedia.length });
  }
  return newMedia;
}

async function concurrent(files, delay) {
  const promises = files.map(async (file, index) => {
    await mockCompress(file, delay);
    await mockUpload(delay);
    return { id: Math.random(), order: index };
  });
  return Promise.all(promises);
}

async function run() {
  const files = [1, 2, 3];
  const delay = 50;

  console.log('Starting Sequential...');
  const startSeq = Date.now();
  await sequential(files, delay);
  const endSeq = Date.now();
  console.log(`Sequential took: ${endSeq - startSeq}ms`);

  console.log('Starting Concurrent...');
  const startCon = Date.now();
  await concurrent(files, delay);
  const endCon = Date.now();
  console.log(`Concurrent took: ${endCon - startCon}ms`);
}

run();
