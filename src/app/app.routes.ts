import { Routes } from '@angular/router';
import { HomePageComponent } from './pages/home/home.page';
import { ProductsPageComponent } from './pages/products/products.page';

export const routes: Routes = [
  { path: '', component: HomePageComponent },
  { path: 'products', component: ProductsPageComponent },
];
