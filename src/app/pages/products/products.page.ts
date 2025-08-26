import { Component, computed, effect, inject, signal } from '@angular/core';
import { NgFor, NgIf, CurrencyPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ProductsService, type Product } from '../../services/products.service';
import { WebSocketService, type Message } from '../../services/ws.service';

@Component({
  selector: 'app-products-page',
  standalone: true,
  imports: [NgFor, NgIf, FormsModule, CurrencyPipe],
  templateUrl: './products.page.html',
  styleUrls: ['./products.page.scss'],
})
export class ProductsPageComponent {
  private readonly productsService = inject(ProductsService);
  private readonly ws = inject(WebSocketService);

  protected readonly loading = signal(false);
  protected readonly products = signal<Product[]>([]);

  // Form properties
  protected formName = '';
  protected formDescription = '';
  protected formPrice = 0;
  protected formCurrency = 'USD';
  protected formStock = 0;
  protected formRating = 0;
  protected formCategory = 'General';
  protected formBrand = 'Unknown';

  constructor() {
    console.log('ProductsPageComponent initialized');
    this.refresh();
    // When server broadcasts invalidation, refetch
    this.ws.messages.subscribe((msg: Message) => {
      if (msg?.type === 'products:invalidate') {
        console.log('[WS] Received invalidation message, refreshing products...');
        // bump cache bypass version via timestamp so nginx bypasses cache
        this.productsService.setBypassVersion(String(Date.now()));
        this.refresh();
      }
    });
  }

  refresh() {
    const bypassVersion = this.productsService['cacheBypassVersion']();
    console.log('[REFRESH] Refreshing products... bypass version:', bypassVersion);
    this.loading.set(true);
    this.productsService.getAll().subscribe({
      next: (list) => {
        console.log('[REFRESH] Products loaded:', list.length, 'items');
        console.log('[REFRESH] Product data:', list);
        this.products.set(list);
      },
      error: (error) => {
        console.error('[REFRESH] Error fetching products:', error);
        this.products.set([]);
      },
      complete: () => {
        console.log('[REFRESH] Products refresh complete');
        this.loading.set(false);
      },
    });
  }

  forceRefresh() {
    console.log('[FORCE-REFRESH] Force refreshing cache...');
    this.loading.set(true);
    this.productsService.refresh().subscribe({
      next: (result) => {
        console.log(
          '[FORCE-REFRESH] Server cache refreshed:',
          result.message,
          'count:',
          result.count
        );
        // Force cache bypass for the next request
        this.productsService.setBypassVersion(String(Date.now()));
        console.log('[FORCE-REFRESH] Client cache bypass set, refreshing UI...');
        this.refresh();
      },
      error: (error) => {
        console.error('[FORCE-REFRESH] Error refreshing cache:', error);
        this.loading.set(false);
      },
    });
  }

  create(event: Event) {
    event.preventDefault();
    const product = {
      name: this.formName?.trim(),
      description: this.formDescription?.trim(),
      price: Number(this.formPrice),
      currency: this.formCurrency || 'USD',
      stock: Number(this.formStock) || 0,
      category: this.formCategory || 'General',
      brand: this.formBrand || 'Unknown',
      rating: Number(this.formRating) || 0,
    };

    if (!product.name || !product.description || !Number.isFinite(product.price)) {
      alert('Please fill in all required fields (name, description, price)');
      return;
    }

    this.productsService.create(product).subscribe({
      next: (result) => {
        console.log('Product created:', result);
        this.clearForm();
        this.refresh();
      },
      error: (error) => {
        console.error('Error creating product:', error);
        alert('Failed to create product');
      },
    });
  }

  clearForm() {
    this.formName = '';
    this.formDescription = '';
    this.formPrice = 0;
    this.formCurrency = 'USD';
    this.formStock = 0;
    this.formRating = 0;
    this.formCategory = 'General';
    this.formBrand = 'Unknown';
  }

  update(p: Product) {
    const price = Number(prompt('New price', String(p.price)) ?? p.price);
    if (!Number.isFinite(price)) return;
    console.log('[UPDATE] Updating product:', p.id, 'new price:', price);
    this.productsService.update(p.id!, { price }).subscribe({
      next: (result) => {
        console.log('[UPDATE] Product updated successfully:', result.message);
        // Force immediate refresh - don't rely only on WebSocket
        this.productsService.setBypassVersion(String(Date.now()));
        // Optimistically update local list for instant UI feedback
        const updated = result.product;
        this.products.update((list) => list.map((it) => (it.id === updated.id ? updated : it)));
        this.refresh();
      },
      error: (error) => {
        console.error('[UPDATE] Error updating product:', error);
        if (error.status === 404) {
          alert('Product not found. It may have been deleted by another user.');
          this.refresh(); // Refresh to remove stale data
        } else {
          alert(
            'Failed to update product: ' + (error.error?.error || error.message || 'Unknown error')
          );
        }
      },
    });
  }

  remove(p: Product) {
    if (!confirm(`Delete ${p.name}?`)) return;
    console.log('[DELETE] Deleting product:', p.id, p.name);
    this.productsService.delete(p.id!).subscribe({
      next: (result) => {
        console.log('[DELETE] Product deleted successfully:', result.message);
        // Force immediate refresh - don't rely only on WebSocket
        this.productsService.setBypassVersion(String(Date.now()));
        // Optimistically remove from local list for instant UI feedback
        const deletedId = result.product.id;
        this.products.update((list) => list.filter((it) => it.id !== deletedId));
        this.refresh();
      },
      error: (error) => {
        console.error('[DELETE] Error deleting product:', error);
        if (error.status === 404) {
          alert('Product not found. It may have already been deleted.');
          this.refresh(); // Refresh to remove stale data
        } else {
          alert(
            'Failed to delete product: ' + (error.error?.error || error.message || 'Unknown error')
          );
        }
      },
    });
  }
}
