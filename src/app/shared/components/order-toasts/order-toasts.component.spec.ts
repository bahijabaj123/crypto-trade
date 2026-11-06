import { provideHttpClient } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { OrderToastsComponent } from './order-toasts.component';

describe('OrderToastsComponent', () => {
  let fixture: ComponentFixture<OrderToastsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [OrderToastsComponent],
      providers: [provideHttpClient()],
    }).compileComponents();

    fixture = TestBed.createComponent(OrderToastsComponent);
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(fixture.componentInstance).toBeTruthy();
  });
});
