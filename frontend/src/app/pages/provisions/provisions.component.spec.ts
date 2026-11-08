import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ProvisionsComponent } from './provisions.component';

describe('ProvisionsComponent', () => {
  let component: ProvisionsComponent;
  let fixture: ComponentFixture<ProvisionsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ProvisionsComponent]
    })
      .compileComponents();

    fixture = TestBed.createComponent(ProvisionsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
