/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SimpleFindWidget } from 'vs/workbench/contrib/codeEditor/browser/find/simpleFindWidget';
import { IContextViewService } from 'vs/platform/contextview/browser/contextView';
import { IContextKeyService, IContextKey } from 'vs/platform/contextkey/common/contextkey';
import { KEYBINDING_CONTEXT_NOTEBOOK_FIND_WIDGET_FOCUSED, INotebookEditor, CellFindMatch, NotebookFindDelegate } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import { FindDecorations } from 'vs/editor/contrib/find/findDecorations';
import { ModelDecorationOptions } from 'vs/editor/common/model/textModel';
import { IModelDeltaDecoration } from 'vs/editor/common/model';
import { ICellModelDeltaDecorations, ICellModelDecorations } from 'vs/workbench/contrib/notebook/browser/viewModel/notebookViewModel';
import { PrefixSumComputer } from 'vs/editor/common/viewModel/prefixSumComputer';

export class NotebookFindWidget extends SimpleFindWidget {
	protected _findWidgetFocused: IContextKey<boolean>;
	private _findMatches: CellFindMatch[] = [];
	protected _findMatchesStarts: PrefixSumComputer | null = null;
	private _currentMatch: number = -1;
	private _allMatchesDecorations: ICellModelDecorations[] = [];
	private _currentMatchDecorations: ICellModelDecorations[] = [];

	constructor(
		private readonly _notebookEditor: INotebookEditor & NotebookFindDelegate,
		@IContextViewService contextViewService: IContextViewService,
		@IContextKeyService contextKeyService: IContextKeyService
	) {
		super(contextViewService, contextKeyService);
		this._findWidgetFocused = KEYBINDING_CONTEXT_NOTEBOOK_FIND_WIDGET_FOCUSED.bindTo(contextKeyService);
	}

	protected onInputChanged(): boolean {
		const val = this.inputValue;
		if (val) {
			const newMatches = this._notebookEditor.startFind(val).filter(match => match.matches.length > 0);
			if (newMatches.length) {
				this.set(newMatches);
				return true;
			} else {
				this.set(null);
				return false;
			}
		} else {
			this.set([]);
			this._notebookEditor.stopFind(false);
		}
		return false;
	}

	protected find(previous: boolean): void {
		if (!this._findMatches.length) {
			return;
		}

		const totalVal = this._findMatchesStarts!.getTotalValue();
		const nextVal = (this._currentMatch + (previous ? -1 : 1) + totalVal) % totalVal;
		this._currentMatch = nextVal;

		const nextIndex = this._findMatchesStarts!.getIndexOf(nextVal);
		const cellIndex = nextIndex.index;
		const matchIndex = nextIndex.remainder;

		this.setCurrentFindMatchDecoration(cellIndex, matchIndex);
		this._notebookEditor.revealInView(this._findMatches[cellIndex].cell, 0);
		// this._notebookEditor.focusNext(this._findMatches[cellIndex], matchIndex);
		return;
	}

	public hide() {
		super.hide();
		this.set([]);
		this._notebookEditor.stopFind(true);
		this._notebookEditor.focus();
	}

	protected findFirst(): void { }

	protected onFocusTrackerFocus() {
		this._findWidgetFocused.set(true);
	}

	protected onFocusTrackerBlur() {
		this._findWidgetFocused.reset();
	}

	protected onFindInputFocusTrackerFocus(): void { }
	protected onFindInputFocusTrackerBlur(): void { }

	private constructFindMatchesStarts() {
		if (this._findMatches && this._findMatches.length) {
			const values = new Uint32Array(this._findMatches.length);
			for (let i = 0; i < this._findMatches.length; i++) {
				values[i] = this._findMatches[i].matches.length;
			}

			this._findMatchesStarts = new PrefixSumComputer(values);
		} else {
			this._findMatchesStarts = null;
		}
	}

	private set(cellFindMatches: CellFindMatch[] | null): void {
		if (!cellFindMatches || !cellFindMatches.length) {
			this._findMatches = [];
			this.setAllFindMatchesDecorations([]);

			this.constructFindMatchesStarts();
			this._currentMatch = -1;
			this.clearCurrentFindMatchDecoration();
			return;
		}

		// all matches
		this._findMatches = cellFindMatches;
		this.setAllFindMatchesDecorations(cellFindMatches || []);

		// current match
		this.constructFindMatchesStarts();
		this._currentMatch = 0;
		this.setCurrentFindMatchDecoration(0, 0);
	}

	private setCurrentFindMatchDecoration(cellIndex: number, matchIndex: number) {
		this._notebookEditor.changeDecorations(accessor => {
			const findMatchesOptions: ModelDecorationOptions = FindDecorations._CURRENT_FIND_MATCH_DECORATION;

			const cell = this._findMatches[cellIndex].cell;
			const match = this._findMatches[cellIndex].matches[matchIndex];
			const decorations: IModelDeltaDecoration[] = [
				{ range: match.range, options: findMatchesOptions }
			];
			const deltaDecoration: ICellModelDeltaDecorations = {
				ownerId: cell.handle,
				decorations: decorations
			};

			this._currentMatchDecorations = accessor.deltaDecorations(this._currentMatchDecorations, [deltaDecoration]);
		});
	}

	private clearCurrentFindMatchDecoration() {
		this._notebookEditor.changeDecorations(accessor => {
			this._currentMatchDecorations = accessor.deltaDecorations(this._currentMatchDecorations, []);
		});
	}

	private setAllFindMatchesDecorations(cellFindMatches: CellFindMatch[]) {
		this._notebookEditor.changeDecorations((accessor) => {

			let findMatchesOptions: ModelDecorationOptions = FindDecorations._FIND_MATCH_DECORATION;

			let deltaDecorations: ICellModelDeltaDecorations[] = cellFindMatches.map(cellFindMatch => {
				const findMatches = cellFindMatch.matches;

				// Find matches
				let newFindMatchesDecorations: IModelDeltaDecoration[] = new Array<IModelDeltaDecoration>(findMatches.length);
				for (let i = 0, len = findMatches.length; i < len; i++) {
					newFindMatchesDecorations[i] = {
						range: findMatches[i].range,
						options: findMatchesOptions
					};
				}

				return { ownerId: cellFindMatch.cell.handle, decorations: newFindMatchesDecorations };
			});

			this._allMatchesDecorations = accessor.deltaDecorations(this._allMatchesDecorations, deltaDecorations);
		});
	}
}
