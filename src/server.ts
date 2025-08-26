import {
  AngularNodeAppEngine,
  createNodeRequestHandler,
  isMainModule,
  writeResponseToNodeResponse,
} from '@angular/ssr/node';
import express from 'express';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { WebSocketServer } from 'ws';

// Import Firebase v9+ modular SDK
import { initializeApp } from 'firebase/app';
import {
  getFirestore,
  collection,
  getDocs,
  getDoc,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  serverTimestamp,
} from 'firebase/firestore';

// Initialize Firebase here to ensure same module instance is used
const firebaseConfig = {
  apiKey: 'AIzaSyBU0ffOSM9kqMIIk8nj6U3TXyOf4bXvdz0',
  authDomain: 'ssr-demo-e4e3a.firebaseapp.com',
  projectId: 'ssr-demo-e4e3a',
  storageBucket: 'ssr-demo-e4e3a.firebasestorage.app',
  messagingSenderId: '86695379632',
  appId: '1:86695379632:web:1e1b67f73dd22bb637f175',
  measurementId: 'G-0K6WLY8524',
};

console.log('[Firebase] Initializing app in server.ts');
const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp);
console.log('[Firebase] Firestore instance created in server.ts');
console.log('[Firebase] db type:', typeof db);
console.log('[Firebase] db constructor:', db.constructor.name);

const browserDistFolder = join(import.meta.dirname, '../browser');

type Product = {
  id?: string;
  name: string;
  description: string;
  price: number;
  currency: string;
  stock: number;
  category: string;
  brand: string;
  rating: number;
  createdAt?: any;
};

// Firestore data structure (as stored in database)
type FirestoreProduct = {
  id?: string;
  name: string;
  description: string;
  price: string; // Stored as string in Firestore
  currency: string;
  stock: string; // Stored as string in Firestore
  category: string;
  brand: string;
  rating: string; // Stored as string in Firestore
  createdAt?: any;
};

// Convert Firestore data to application data
function convertFirestoreProduct(firestoreProduct: any, docId: string): Product {
  return {
    id: docId,
    name: firestoreProduct['name'],
    description: firestoreProduct['description'],
    price: parseFloat(firestoreProduct['price']) || 0,
    currency: firestoreProduct['currency'],
    stock: parseInt(firestoreProduct['stock']) || 0,
    category: firestoreProduct['category'],
    brand: firestoreProduct['brand'],
    rating: parseFloat(firestoreProduct['rating']) || 0,
    createdAt: firestoreProduct['createdAt'],
  };
}

// Cache for products data
let productsCache: Product[] | null = null;
let lastFetchTime = 0;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

async function fetchProductsFromFirestore(): Promise<Product[]> {
  try {
    console.log('Fetching products from Firestore...');
    const productsRef = getProductsCollectionRef();
    console.log('Collection reference created');

    const q = query(productsRef, orderBy('createdAt', 'desc'));
    console.log('Query created');

    const querySnapshot = await getDocs(q);
    console.log('Query executed, got', querySnapshot.size, 'documents');

    const products: Product[] = [];
    querySnapshot.forEach((docSnap: any) => {
      const data = docSnap.data();
      console.log('Document data:', docSnap.id, data);
      products.push(convertFirestoreProduct(data, docSnap.id));
    });

    console.log('Converted products:', products);
    return products;
  } catch (error) {
    console.error('Error fetching products from Firestore:', error);
    console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    console.error('Error message:', error instanceof Error ? error.message : 'No message');
    // Return cached data if available, otherwise empty array
    return productsCache || [];
  }
}

async function getProducts(): Promise<Product[]> {
  const now = Date.now();

  // Return cached data if it's still valid
  if (productsCache && now - lastFetchTime < CACHE_DURATION) {
    return productsCache;
  }

  // Fetch fresh data from Firestore
  const products = await fetchProductsFromFirestore();
  productsCache = products;
  lastFetchTime = now;

  return products;
}

function getProductsCollectionRef() {
  try {
    console.log('[Firestore] Creating collection reference...');
    console.log('[Firestore] db type:', typeof db);
    console.log('[Firestore] db constructor:', db.constructor.name);

    const colRef = collection(db, 'Products');
    console.log('[Firestore] collection("Products") created successfully:', !!colRef);
    console.log('[Firestore] collection type:', typeof colRef);
    return colRef;
  } catch (err) {
    console.error('[Firestore] Failed to create collection ref:', err);
    throw err;
  }
}

const app = express();
const angularApp = new AngularNodeAppEngine();

app.use(express.json());

// In environments where this module is imported (not the main entry), there's no HTTP
// server we control to attach WebSocket upgrade handling to. To ensure WS is available
// for cache invalidation broadcasts, start a standalone WebSocket server on WS_PORT.
if (!isMainModule(import.meta.url)) {
  const wsPort = Number(process.env['WS_PORT'] || 4001);
  const wssStandalone = new WebSocketServer({ port: wsPort, path: '/ws' });
  app.set('wss', wssStandalone);
  app.set('wssStandalone', wssStandalone);
  wssStandalone.on('listening', () => {
    console.log(`[WS] standalone listening on ws://localhost:${wsPort}/ws`);
  });
  wssStandalone.on('connection', (socket, req) => {
    console.log('[WS] standalone client connected from', req.socket.remoteAddress);
    socket.on('close', () => console.log('[WS] standalone client disconnected'));
    socket.on('error', (err) => console.error('[WS] standalone socket error', err));
  });
  wssStandalone.on('error', (err) => {
    console.error('[WS] standalone server error', err);
  });
}

// Diagnostic endpoint to verify server reachability on /ws via plain HTTP
// Visiting http://localhost:4000/ws in a browser should return 426 from this handler
// Actual WS connections use HTTP Upgrade and won't hit this route
app.get('/ws', (req, res) => {
  res.status(426).send('WebSocket endpoint. Use ws:// or wss:// to connect.');
});

// Test Firebase connection
app.get('/api/test-firebase', async (req, res) => {
  try {
    console.log('Testing Firebase connection...');
    const productsRef = getProductsCollectionRef();
    const querySnapshot = await getDocs(productsRef);
    console.log('Successfully connected to Firestore, found', querySnapshot.size, 'documents');
    res.json({
      success: true,
      message: 'Firebase connection working',
      documentCount: querySnapshot.size,
    });
  } catch (error) {
    console.error('Firebase connection test failed:', error);
    res.status(500).json({
      success: false,
      error: 'Firebase connection failed',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// --- API Endpoints ---
app.get('/api/products', async (req, res) => {
  try {
    console.log('[GET] /api/products start');
    const products = await getProducts();
    console.log('[GET] /api/products returning', products.length, 'items');
    res.json(products);
  } catch (error) {
    console.error('Error in /api/products:', error);
    res.status(500).json({ error: 'Failed to fetch products' });
  }
});

app.get('/api/products/:id', async (req, res) => {
  try {
    console.log('[GET] /api/products/:id param id =', req.params.id);
    const productRef = doc(db, 'Products', req.params.id);
    const productSnap = await getDoc(productRef);

    if (!productSnap.exists()) {
      console.warn('[GET] /api/products/:id not found', req.params.id);
      res.status(404).json({ error: 'Not found' });
      return;
    }

    const data = productSnap.data();
    const product = convertFirestoreProduct(data, productSnap.id);

    console.log('[GET] /api/products/:id returning product', product.id);
    res.json(product);
  } catch (error) {
    console.error('Error in /api/products/:id:', error);
    res.status(500).json({ error: 'Failed to fetch product' });
  }
});

function invalidateServerCache() {
  productsCache = null;
  lastFetchTime = 0;
  console.log('[Cache] Server cache invalidated');
}

async function refreshProductsCache(): Promise<number> {
  try {
    const products = await fetchProductsFromFirestore();
    productsCache = products;
    lastFetchTime = Date.now();
    console.log('[Cache] Server cache repopulated with', products.length, 'items');
    return products.length;
  } catch (err) {
    console.error('[Cache] Failed to repopulate cache', err);
    return productsCache?.length || 0;
  }
}

function broadcastInvalidation() {
  const wss: WebSocketServer | undefined = app.get('wss');
  console.log('[WS] WebSocket server available:', !!wss);
  console.log('[WS] WebSocket server type:', typeof wss);

  if (!wss) {
    console.warn(
      '[WS] CRITICAL: No WebSocket server available for broadcast - clients will not receive updates!'
    );
    return;
  }

  console.log('[WS] WebSocket clients count:', wss.clients.size);
  const payload = JSON.stringify({ type: 'products:invalidate' });
  let clientCount = 0;
  wss.clients.forEach((client: any) => {
    try {
      console.log('[WS] Client readyState:', client.readyState);
      if (client.readyState === 1) {
        client.send(payload);
        clientCount++;
        console.log('[WS] Message sent to client');
      } else {
        console.log('[WS] Client not ready, readyState:', client.readyState);
      }
    } catch (err) {
      console.warn('[WS] Failed to send to client:', err);
    }
  });
  console.log(
    `[WS] Broadcasted invalidation to ${clientCount} clients out of ${wss.clients.size} total`
  );
}

// Create new product
app.post('/api/products', async (req, res) => {
  try {
    console.log('Creating product with body:', req.body);
    const { name, description, price, currency, stock, category, brand, rating } = req.body;

    if (!name || !description || price === undefined || price === null || price === '') {
      console.warn('[POST] invalid payload', { name, hasDescription: !!description, price });
      res
        .status(400)
        .json({ error: 'Invalid payload - name, description, and price are required' });
      return;
    }

    // Convert all inputs to strings for Firestore storage
    const productData = {
      name: String(name),
      description: String(description),
      price: String(price), // Store as string in Firestore
      currency: String(currency || 'USD'),
      stock: String(stock || '0'), // Store as string in Firestore
      category: String(category || 'General'),
      brand: String(brand || 'Unknown'),
      rating: String(rating || '0'), // Store as string in Firestore
      createdAt: serverTimestamp(),
    };

    console.log('Product data to store:', productData);

    const colRef = getProductsCollectionRef();
    const docRef = await addDoc(colRef, productData);
    console.log('Product created with ID:', docRef.id);

    // Invalidate, warm cache, then notify clients
    invalidateServerCache();
    await refreshProductsCache();
    broadcastInvalidation();

    const newProduct = convertFirestoreProduct(productData, docRef.id);
    console.log('Returning new product:', newProduct);

    res.status(201).json(newProduct);
  } catch (error) {
    console.error('Detailed error creating product:', error);
    console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    console.error('Error message:', error instanceof Error ? error.message : 'No message');
    res.status(500).json({
      error: 'Failed to create product',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Update product
app.put('/api/products/:id', async (req, res) => {
  try {
    const { name, description, price, currency, stock, category, brand, rating } = req.body;
    const productRef = doc(db, 'Products', req.params.id);

    // Check if document exists first
    const existingSnap = await getDoc(productRef);
    if (!existingSnap.exists()) {
      console.warn('[PUT] /api/products/:id document not found', req.params.id);
      res.status(404).json({ error: 'Product not found' });
      return;
    }

    const updateData: any = {};
    if (name !== undefined) updateData.name = String(name);
    if (description !== undefined) updateData.description = String(description);
    if (price !== undefined) updateData.price = String(price);
    if (currency !== undefined) updateData.currency = String(currency);
    if (stock !== undefined) updateData.stock = String(stock);
    if (category !== undefined) updateData.category = String(category);
    if (brand !== undefined) updateData.brand = String(brand);
    if (rating !== undefined) updateData.rating = String(rating);

    console.log('[PUT] Updating product', req.params.id, 'with data:', updateData);
    await updateDoc(productRef, updateData);

    // Invalidate, warm cache, then notify clients
    invalidateServerCache();
    await refreshProductsCache();
    broadcastInvalidation();

    // Get updated product
    const updatedSnap = await getDoc(productRef);
    const data = updatedSnap.data();
    if (!data) {
      res.status(404).json({ error: 'Product not found after update' });
      return;
    }
    const updatedProduct = convertFirestoreProduct(data, updatedSnap.id);

    console.log('[PUT] Product updated successfully:', updatedProduct.id);
    res.json({ message: 'Product updated successfully', product: updatedProduct });
  } catch (error) {
    console.error('Error updating product:', error);
    if (error instanceof Error && error.message.includes('NOT_FOUND')) {
      res.status(404).json({ error: 'Product not found' });
    } else {
      res.status(500).json({
        error: 'Failed to update product',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
});

// Delete product
app.delete('/api/products/:id', async (req, res) => {
  try {
    console.log('[DELETE] /api/products/:id param id =', req.params.id);
    const productRef = doc(db, 'Products', req.params.id);
    const productSnap = await getDoc(productRef);

    if (!productSnap.exists()) {
      console.warn('[DELETE] /api/products/:id document not found', req.params.id);
      res.status(404).json({ error: 'Product not found' });
      return;
    }

    const data = productSnap.data();
    const deletedProduct = convertFirestoreProduct(data, productSnap.id);

    console.log('[DELETE] Deleting product:', deletedProduct.id, deletedProduct.name);
    await deleteDoc(productRef);

    // Invalidate, warm cache, then notify clients
    invalidateServerCache();
    await refreshProductsCache();
    broadcastInvalidation();

    console.log('[DELETE] Product deleted successfully:', deletedProduct.id);
    res.json({ message: 'Product deleted successfully', product: deletedProduct });
  } catch (error) {
    console.error('Error deleting product:', error);
    if (error instanceof Error && error.message.includes('NOT_FOUND')) {
      res.status(404).json({ error: 'Product not found' });
    } else {
      res.status(500).json({
        error: 'Failed to delete product',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
});

// Force cache refresh endpoint
app.post('/api/products/refresh', async (req, res) => {
  try {
    console.log('[REFRESH] Force cache refresh requested');
    invalidateServerCache();
    console.log('[REFRESH] Cache invalidated, fetching fresh products...');
    const count = await refreshProductsCache();
    broadcastInvalidation();
    console.log('[REFRESH] Fetched', count, 'products from fresh cache');
    res.json({ message: 'Cache refreshed', count });
  } catch (error) {
    console.error('[REFRESH] Error refreshing products cache:', error);
    res.status(500).json({ error: 'Failed to refresh cache' });
  }
});

/**
 * Serve static files from /browser
 */
app.use(
  express.static(browserDistFolder, {
    maxAge: '1y',
    index: false,
    redirect: false,
  })
);

/**
 * Handle all other requests by rendering the Angular application.
 */
app.use((req, res, next) => {
  angularApp
    .handle(req)
    .then((response) => (response ? writeResponseToNodeResponse(response, res) : next()))
    .catch(next);
});

/**
 * Start the server if this module is the main entry point.
 * The server listens on the port defined by the `PORT` environment variable, or defaults to 4000.
 */
if (isMainModule(import.meta.url)) {
  const port = Number(process.env['PORT'] || 4000);
  const server = createServer(app);
  const wss = new WebSocketServer({ server, path: '/ws' });
  app.set('wss', wss);
  // Log when HTTP server is ready and any upgrade attempts
  server.on('listening', () => {
    console.log('[HTTP] server listening, WS active on path /ws');
  });
  server.on('upgrade', (req) => {
    console.log('[HTTP] upgrade requested for', req.url);
  });
  wss.on('connection', (socket, req) => {
    console.log('[WS] TESTINGI client connected from', req.socket.remoteAddress);
    socket.on('close', () => console.log('[WS] client disconnected'));
    socket.on('error', (err) => console.error('[WS] socket error', err));
  });
  wss.on('error', (err) => {
    console.error('[WS] server error', err);
  });
  server.listen(port, (error?: unknown) => {
    if (error) throw error as Error;
    console.log(`Node server listening on http://localhost:${port}`);
  });
}

/**
 * Request handler used by the Angular CLI (for dev-server and during build) or Firebase Cloud Functions.
 */
export const reqHandler = createNodeRequestHandler(app);
