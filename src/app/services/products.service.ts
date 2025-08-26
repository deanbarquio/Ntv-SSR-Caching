import { inject, Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map } from 'rxjs';

// Raw Firestore data structure (as it comes from the database)
export interface FirestoreProduct {
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
}

// Processed Product type for the application
export interface Product {
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
}

@Injectable({ providedIn: 'root' })
export class ProductsService {
  private readonly http = inject(HttpClient);

  // Version used to bypass nginx cache on demand via query param
  private readonly cacheBypassVersion = signal<string>('0');

  setBypassVersion(version: string) {
    this.cacheBypassVersion.set(version);
  }

  // Convert Firestore data to application data
  private convertFirestoreProduct(firestoreProduct: FirestoreProduct): Product {
    return {
      id: firestoreProduct.id,
      name: firestoreProduct.name,
      description: firestoreProduct.description,
      price: parseFloat(firestoreProduct.price) || 0,
      currency: firestoreProduct.currency,
      stock: parseInt(firestoreProduct.stock) || 0,
      category: firestoreProduct.category,
      brand: firestoreProduct.brand,
      rating: parseFloat(firestoreProduct.rating) || 0,
      createdAt: firestoreProduct.createdAt,
    };
  }

  // Convert application data to Firestore format
  private convertToFirestoreFormat(product: Omit<Product, 'id'>): Omit<FirestoreProduct, 'id'> {
    return {
      name: String(product.name),
      description: String(product.description),
      price: String(product.price),
      currency: String(product.currency),
      stock: String(product.stock),
      category: String(product.category),
      brand: String(product.brand),
      rating: String(product.rating),
      createdAt: product.createdAt,
    };
  }

  getAll(): Observable<Product[]> {
    const v = this.cacheBypassVersion();
    const url = `/api/products`;
    const params = v ? { v } : undefined;
    console.log('[SERVICE] getAll() called with URL:', url, 'params:', params);
    return this.http.get<FirestoreProduct[]>(url, { params }).pipe(
      map((products) => {
        console.log('[SERVICE] Received', products.length, 'products from API');
        return products.map((p) => this.convertFirestoreProduct(p));
      })
    );
  }

  getById(id: string): Observable<Product> {
    const v = this.cacheBypassVersion();
    return this.http
      .get<FirestoreProduct>(`/api/products/${id}`, { params: v ? { v } : undefined })
      .pipe(map((product) => this.convertFirestoreProduct(product)));
  }

  create(product: Omit<Product, 'id'>): Observable<Product> {
    const firestoreProduct = this.convertToFirestoreFormat(product);
    return this.http
      .post<FirestoreProduct>(`/api/products`, firestoreProduct)
      .pipe(map((result) => this.convertFirestoreProduct(result)));
  }

  refresh(): Observable<{ message: string; count: number }> {
    console.log('[SERVICE] refresh() called - hitting /api/products/refresh');
    return this.http.post<{ message: string; count: number }>(`/api/products/refresh`, {});
  }

  update(
    id: string,
    input: Partial<Pick<Product, 'name' | 'price' | 'description' | 'stock' | 'rating'>>
  ): Observable<{ message: string; product: Product }> {
    // Convert all values to strings for Firestore
    const firestoreInput: any = {};
    if (input.name !== undefined) firestoreInput.name = String(input.name);
    if (input.description !== undefined) firestoreInput.description = String(input.description);
    if (input.price !== undefined) firestoreInput.price = String(input.price);
    if (input.stock !== undefined) firestoreInput.stock = String(input.stock);
    if (input.rating !== undefined) firestoreInput.rating = String(input.rating);

    return this.http
      .put<{ message: string; product: FirestoreProduct }>(`/api/products/${id}`, firestoreInput)
      .pipe(
        map((result) => ({
          message: result.message,
          product: this.convertFirestoreProduct(result.product),
        }))
      );
  }

  delete(id: string): Observable<{ message: string; product: Product }> {
    return this.http
      .delete<{ message: string; product: FirestoreProduct }>(`/api/products/${id}`)
      .pipe(
        map((result) => ({
          message: result.message,
          product: this.convertFirestoreProduct(result.product),
        }))
      );
  }
}
