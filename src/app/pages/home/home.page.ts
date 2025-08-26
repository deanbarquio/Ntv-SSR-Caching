import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-home-page',
  standalone: true,
  imports: [RouterLink],
  template: `
    <section>
      <h2>Home</h2>
      <p>Welcome. Navigate to Products to view cached data with WebSocket invalidation.</p>
      <p>
        <a routerLink="/products">Go to Products</a>
      </p>
    </section>
  `,
})
export class HomePageComponent {}
