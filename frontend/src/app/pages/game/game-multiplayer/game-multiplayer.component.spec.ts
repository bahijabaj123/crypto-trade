import { ComponentFixture, TestBed } from '@angular/core/testing';
import { GameMultiplayerComponent } from './game-multiplayer.component';

describe('GameMultiplayerComponent', () => {
  let component: GameMultiplayerComponent;
  let fixture: ComponentFixture<GameMultiplayerComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [GameMultiplayerComponent]
    })
      .compileComponents();

    fixture = TestBed.createComponent(GameMultiplayerComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
