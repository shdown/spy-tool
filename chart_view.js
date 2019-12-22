import { Chart } from "chart.js";
import { View } from "./view.js";
import { monotonicNowMillis, clearArray } from "./utils.js";

const BG_COLOR = 'rgba(230,230,230,0.3)';

// https://mycolor.space/?hex=%234A76A8&sub=1
const FG_COLORS = [
    '#4A76A8', // blue
    '#A45E75', // red
    '#008A5F', // green
    '#C4A270', // brown
];

const DEFAULT_PARAMS = {
    barPercentage: 1,
    categoryPercentage: 1,
    borderColor: '#333333',
    borderWidth: 1,
    maxBarThickness: 20,
};

const MIN_INTERVAL_MILLIS = 600;
const UPDATE_DURATION_MILLIS = 350;

export class ChartView extends View {
    constructor() {
        super();
        this._canvas = document.createElement('canvas');
        const data = {
            labels: [],
            datasets: [
                {...DEFAULT_PARAMS, data: [], backgroundColor: []},
                {...DEFAULT_PARAMS, data: [], backgroundColor: []},
            ],
        };
        const options = {
            tooltips: {enabled: false},
            legend: {display: false},
            scales: {
                yAxes: [
                    {ticks: {beginAtZero: true}, stacked: true},
                ],
                xAxes: [
                    {stacked: true},
                ],
            },
        };
        this._chart = new Chart(this._canvas, {
            type: 'bar',
            data: data,
            options: options,
        });
        this._fgIndices = [];
        this._lastRepaintTimestamp = -Infinity;
        this._repaintTimerId = null;
    }

    get element() {
        return this._canvas;
    }

    _nextFgColorFor(i) {
        this._fgIndices[i] = (this._fgIndices[i] + 1) % FG_COLORS.length;
        return FG_COLORS[this._fgIndices[i]];
    }

    _update(i, value, newBar) {
        this._chart.data.datasets[0].data[i] = value.offset;
        this._chart.data.datasets[1].data[i] = value.total - value.offset;
        if (newBar) {
            this._chart.data.labels[i] = String(value.id);
            this._chart.data.datasets[0].backgroundColor[i] = this._nextFgColorFor(i);
            this._chart.data.datasets[1].backgroundColor[i] = BG_COLOR;
        }
    }

    setBarValue(i, value) {
        this._update(i, value, false);
    }

    addBar(i, value) {
        this._chart.data.labels.push('');
        this._chart.data.datasets[0].data.push(1);
        this._chart.data.datasets[1].data.push(1);
        this._chart.data.datasets[0].backgroundColor.push('');
        this._chart.data.datasets[1].backgroundColor.push('');
        this._fgIndices.push(-1);
        this._update(i, value, true);
    }

    alterBar(i, value) {
        this._update(i, value, true);
    }

    _repaint(duration = UPDATE_DURATION_MILLIS) {
        this._lastRepaintTimestamp = monotonicNowMillis();
        this._chart.update({duration: duration});
    }

    _scheduleRepaint(delayMillis) {
        this._repaintTimerId = setTimeout(() => {
            this._repaint();
            this._repaintTimerId = null;
        }, delayMillis);
    }

    flush() {
        if (this._repaintTimerId !== null)
            return;
        const interval = monotonicNowMillis() - this._lastRepaintTimestamp;
        if (interval < MIN_INTERVAL_MILLIS)
            this._scheduleRepaint(MIN_INTERVAL_MILLIS - interval);
        else
            this._repaint();
    }

    reset() {
        if (this._repaintTimerId !== null) {
            clearTimeout(this._repaintTimerId);
            this._repaintTimerId = null;
        }
        clearArray(this._chart.data.labels);
        clearArray(this._chart.data.datasets[0].data);
        clearArray(this._chart.data.datasets[1].data);
        clearArray(this._chart.data.datasets[0].backgroundColor);
        clearArray(this._chart.data.datasets[1].backgroundColor);
        clearArray(this._fgIndices);
        this._repaint(20);
    }

    mount() {
    }

    unmount() {
        this.reset();
    }
}
