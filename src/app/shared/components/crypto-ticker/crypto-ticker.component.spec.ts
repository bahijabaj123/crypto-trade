import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CryptoTickerComponent } from './crypto-ticker.component';

describe('CryptoTickerComponent', () => {
  let component: CryptoTickerComponent;
  let fixture: ComponentFixture<CryptoTickerComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CryptoTickerComponent]
    })
      .compileComponents();

    fixture = TestBed.createComponent(CryptoTickerComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
