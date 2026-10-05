import { ComponentFixture, TestBed } from '@angular/core/testing';
import { OrderbookComponent } from './orderbook.component';

describe('OrderbookComponent', () => {
  let component: OrderbookComponent;
  let fixture: ComponentFixture<OrderbookComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [OrderbookComponent]
    })
      .compileComponents();

    fixture = TestBed.createComponent(OrderbookComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
