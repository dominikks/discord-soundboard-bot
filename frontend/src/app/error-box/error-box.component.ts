import { trigger, state, style, transition, animate } from '@angular/animations';
import { ChangeDetectionStrategy, Component, OnDestroy } from '@angular/core';
import { BehaviorSubject, Subject } from 'rxjs';
import { takeUntil, withLatestFrom } from 'rxjs/operators';
import { ErrorService } from '../services/error.service';

@Component({
  selector: 'app-error-box',
  templateUrl: './error-box.component.html',
  styleUrls: ['./error-box.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  animations: [
    trigger('enterLeave', [
      state('*', style({ transform: 'translateY(0)' })),
      transition(':enter', [style({ transform: 'translateY(100%)' }), animate('200ms ease-out')]),
      transition(':leave', [animate('200ms ease-in', style({ transform: 'translateY(100%)' }))]),
    ]),
  ],
})
export class ErrorBoxComponent implements OnDestroy {
  private onDestroy$ = new Subject<void>();
  errors$ = new BehaviorSubject<string[]>([]);

  constructor(private errorService: ErrorService) {
    this.errorService.errors$.pipe(takeUntil(this.onDestroy$), withLatestFrom(this.errors$)).subscribe(([error, errors]) => {
      this.errors$.next([...errors, error]);
    });
  }

  ngOnDestroy() {
    this.onDestroy$.next();
    this.onDestroy$.complete();
  }

  ignore() {
    this.errors$.next([]);
  }
}
