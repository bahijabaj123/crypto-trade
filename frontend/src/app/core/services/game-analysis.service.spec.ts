import { TestBed } from '@angular/core/testing';
import { GameAnalysisService } from './game-analysis.service';

describe('GameAnalysisService', () => {
  let service: GameAnalysisService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(GameAnalysisService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
