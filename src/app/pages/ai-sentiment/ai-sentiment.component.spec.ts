import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AiSentimentComponent } from './ai-sentiment.component';

describe('AiSentimentComponent', () => {
  let component: AiSentimentComponent;
  let fixture: ComponentFixture<AiSentimentComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AiSentimentComponent]
    })
      .compileComponents();

    fixture = TestBed.createComponent(AiSentimentComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
