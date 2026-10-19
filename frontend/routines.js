
'use strict';

const USE_SAMPLE_DATA = false; //true while using sample data

const pageStatus = document.querySelector('#page-status');
const routinesList = document.querySelector('#routines-list');
const routineCount = document.querySelector('#routine-count');

const formSection = document.querySelector('#routine-form-section');
const form = document.querySelector('#routine-form');
const formTitle = document.querySelector('#form-title');
const formStatus = document.querySelector('#form-status');

const routineId = document.querySelector('#routine-id');
const routineName = document.querySelector('#routine-name');
const routineDesc = document.querySelector('#routine-desc');

const exercisesContainer =
    document.querySelector('#selected-exercises-container');

let exerciseCatalog = [];

let routines = [];

/*sample data. PLaceholder until backend is connected*/

const sampleExercises = [
    { id: '1', name: 'Bench Press' },
    { id: '2', name: 'Squat' },
    { id: '3', name: 'Deadlift' },
    { id: '4', name: 'Shoulder Press' },
    { id: '5', name: 'Lat Pulldown' },
    { id: '6', name: 'Bicep Curl' },
    { id: '7', name: 'Tricep Pushdown' },
    { id: '8', name: 'Lunges' }
];

const sampleRoutines = [
    {
        id: 'upper',
        name: 'Upper Body',
        description: 'Build strength in your chest, back, and arms.',
        exercises: [
            { id: '1', sets: 3, reps: 10 },
            { id: '5', sets: 3, reps: 12 },
            { id: '4', sets: 3, reps: 10 },
            { id: '6', sets: 3, reps: 12 }
        ]
    },
    {
        id: 'lower',
        name: 'Lower Body',
        description: 'Focus on legs, glutes, and lower-body strength.',
        exercises: [
            { id: '2', sets: 3, reps: 10 },
            { id: '8', sets: 3, reps: 12 },
            { id: '3', sets: 3, reps: 8 }
        ]
    },
    {
        id: 'full',
        name: 'Full Body',
        description: 'A balanced workout for your entire body.',
        exercises: [
            { id: '2', sets: 3, reps: 10 },
            { id: '1', sets: 3, reps: 10 },
            { id: '5', sets: 3, reps: 12 },
            { id: '4', sets: 3, reps: 10 },
            { id: '6', sets: 3, reps: 12 }
        ]
    }
];

function renderRoutines() {
    routinesList.replaceChildren();

    routineCount.textContent = `${routines.length} ROUTINES`;

    if (routines.length === 0) {
        const emptyMessage = document.createElement('p');
        emptyMessage.textContent =
            'You have no routines yet. Select New Routine to create one.';
        routinesList.append(emptyMessage);
        return;
    }

    routines.forEach((routine, index) => {
        const card = document.createElement('article');
        card.className = 'card routine-card';

        const top = document.createElement('div');
        top.className = 'routine-card-top';

        const icon = document.createElement('span');
        icon.className = 'routine-icon';
        icon.setAttribute('aria-hidden', 'true');
        icon.textContent = ['↗', '↓', '✳'][index % 3];

        const tag = document.createElement('span');
        tag.className = 'routine-tag';
        tag.textContent = 'TRAINING ROUTINE';

        const deleteButton = document.createElement('button');
        deleteButton.className = 'routine-delete-button';
        deleteButton.type = 'button';
        deleteButton.textContent = '🗑';
        deleteButton.dataset.deleteRoutine = String(routine.id);
        deleteButton.setAttribute(
            'aria-label',
            `Delete ${routine.name}`
        );
        deleteButton.title = 'Delete routine';

        top.append(icon, tag, deleteButton);

        const heading = document.createElement('h3');
        heading.textContent = routine.name;

        const description = document.createElement('p');
        description.textContent =
            routine.description || 'No description provided.';

        const details = document.createElement('div');
        details.className = 'routine-details';

        const count = document.createElement('span');
        count.textContent =
            `${routine.exercises ? routine.exercises.length : 0} exercises`;

        details.append(count);

        const actions = document.createElement('div');
        actions.className = 'routine-card-actions';

        const startButton = document.createElement('button');
        startButton.className = 'routine-start-button';
        startButton.type = 'button';
        startButton.textContent = 'Start Routine';
        startButton.dataset.startRoutine = String(routine.id);

        const editButton = document.createElement('button');
        editButton.className = 'routine-edit-button';
        editButton.type = 'button';
        editButton.textContent = 'Edit';
        editButton.dataset.editRoutine = String(routine.id);

        actions.append(startButton, editButton);

        card.append(top, heading, description, details, actions);
        routinesList.append(card);
    });
}

function addExerciseRow(exercise = {}) {
    const row = document.createElement('div');
    row.className = 'exercise-row';

    const exerciseLabel = document.createElement('label');
    exerciseLabel.textContent = 'Exercise';

    const select = document.createElement('select');
    select.name = 'exerciseId';
    select.required = true;
    select.setAttribute('aria-label', 'Exercise');

    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = 'Select exercise';
    select.append(placeholder);

    exerciseCatalog.forEach(item => {
        const option = document.createElement('option');

        option.value = String(item.id);
        option.textContent = item.name;

        select.append(option);
    });

    select.value = String(
        exercise.id ?? exercise.exercise_id ?? ''
    );

    exerciseLabel.append(select);

    const setsLabel = document.createElement('label');
    setsLabel.textContent = 'Sets';

    const setsInput = document.createElement('input');
    setsInput.type = 'number';
    setsInput.name = 'sets';
    setsInput.min = '1';
    setsInput.max = '100';
    setsInput.required = true;
    setsInput.value =
        exercise.sets ?? exercise.target_sets ?? 3;
    setsInput.setAttribute('aria-label', 'Target sets');

    setsLabel.append(setsInput);

    const repsLabel = document.createElement('label');
    repsLabel.textContent = 'Reps';

    const repsInput = document.createElement('input');
    repsInput.type = 'number';
    repsInput.name = 'reps';
    repsInput.min = '1';
    repsInput.max = '1000';
    repsInput.required = true;
    repsInput.value =
        exercise.reps ?? exercise.target_reps ?? 10;
    repsInput.setAttribute('aria-label', 'Target reps');

    repsLabel.append(repsInput);

    const removeButton = document.createElement('button');
    removeButton.type = 'button';
    removeButton.className = 'text-button remove-exercise';
    removeButton.textContent = 'Remove';
    removeButton.setAttribute('aria-label', 'Remove exercise');

    removeButton.addEventListener('click', () => {
        row.remove();
        formStatus.textContent = 'Exercise removed.';
    });

    row.append(
        exerciseLabel,
        setsLabel,
        repsLabel,
        removeButton
    );

    exercisesContainer.append(row);
}

function getRoutineExercises(routine) {
    return (routine.exercises || []).map(exercise => ({
        id: String(exercise.id ?? exercise.exercise_id),
        sets: exercise.sets ?? exercise.target_sets,
        reps: exercise.reps ?? exercise.target_reps
    }));
}


function openCreateForm() {
    form.reset();

    routineId.value = '';
    routineName.value = '';
    routineDesc.value = '';

    exercisesContainer.replaceChildren();
    addExerciseRow();

    formTitle.textContent = 'Create Routine';
    formStatus.textContent = '';

    formSection.hidden = false;
    formSection.scrollIntoView({
        behavior: 'smooth',
        block: 'start'
    });

    routineName.focus();
}


function openEditForm(id) {
    const routine = routines.find(
        item => String(item.id) === String(id)
    );

    if (!routine) {
        pageStatus.textContent = 'Could not find that routine.';
        return;
    }

    form.reset();

    routineId.value = String(routine.id);
    routineName.value = routine.name;
    routineDesc.value = routine.description || '';

    exercisesContainer.replaceChildren();

    getRoutineExercises(routine).forEach(exercise => {
        addExerciseRow(exercise);
    });

    formTitle.textContent = 'Edit Routine';
    formStatus.textContent = '';

    formSection.hidden = false;
    formSection.scrollIntoView({
        behavior: 'smooth',
        block: 'start'
    });

    routineName.focus();
}

function closeForm() {
    formSection.hidden = true;
    form.reset();
    exercisesContainer.replaceChildren();
    formStatus.textContent = '';
}

//Database connection

async function loadExercisesFromDatabase() {
    const data = await gymApi('/exercises');

    const exerciseData = Array.isArray(data)
        ? data
        : data.exercises;

    if (!Array.isArray(exerciseData)) {
        throw new Error(
            'The exercises API did not return an exercise list.'
        );
    }

    exerciseCatalog = exerciseData;
}

async function loadRoutinesFromDatabase() {
    const data = await gymApi('/routines');

    const routineData = Array.isArray(data)
        ? data
        : data.routines;

    if (!Array.isArray(routineData)) {
        throw new Error(
            'The routines API did not return a routine list.'
        );
    }

    routines = routineData;
    renderRoutines();
}

async function saveRoutineToDatabase(payload) {
    const id = routineId.value;

    if (id) {
        return await gymApi(
            `/routines/${encodeURIComponent(id)}`,
            {
                method: 'PUT',
                body: JSON.stringify(payload)
            }
        );
    }

    return await gymApi('/routines', {
        method: 'POST',
        body: JSON.stringify(payload)
    });
}


document.querySelector('#open-create-modal')
    .addEventListener('click', openCreateForm);

document.querySelector('#add-exercise-row')
    .addEventListener('click', () => addExerciseRow());

document.querySelector('#cancel-form')
    .addEventListener('click', closeForm);


routinesList.addEventListener('click', async event => {
    const deleteButton = event.target.closest('[data-delete-routine]');
    const startButton = event.target.closest('[data-start-routine]');
    const editButton = event.target.closest('[data-edit-routine]');

    if (deleteButton) {
        const id = deleteButton.dataset.deleteRoutine;
        const routine = routines.find(
            item => String(item.id) === String(id)
        );

        if (!routine) {
            pageStatus.textContent = 'Could not find that routine.';
            return;
        }

        const confirmed = window.confirm(
            `Are you sure you want to delete "${routine.name}"?`
        );

        if (!confirmed) {
            return;
        }

        deleteButton.disabled = true;
        pageStatus.textContent = 'Deleting routine...';

        try {
            if (USE_SAMPLE_DATA) {
                routines = routines.filter(
                    item => String(item.id) !== String(id)
                );
            } else {
                await gymApi(
                    `/routines/${encodeURIComponent(id)}`,
                    { method: 'DELETE' }
                );

                await loadRoutinesFromDatabase();
            }

            renderRoutines();
            pageStatus.textContent = USE_SAMPLE_DATA
                ? ' '
                : 'Routine deleted successfully.';
        } catch (error) {
            pageStatus.textContent =
                `Could not delete routine: ${error.message}`;
            deleteButton.disabled = false;
        }

        return;
    }

    if (startButton) {
        return;
    }

    if (editButton) {
        openEditForm(editButton.dataset.editRoutine);
    }
});


form.addEventListener('submit', async event => {
    event.preventDefault();

    const name = routineName.value.trim();

    if (!name) {
        routineName.setCustomValidity(
            'Please enter a routine name.'
        );
        routineName.reportValidity();
        routineName.setCustomValidity('');
        return;
    }

    const rows = [
        ...exercisesContainer.querySelectorAll('.exercise-row')
    ];

    if (rows.length === 0) {
        formStatus.textContent = 'Add at least one exercise.';
        return;
    }

    const exercises = [];

    for (const row of rows) {
        const select = row.querySelector('select');
        const inputs = row.querySelectorAll('input');

        if (
            !select.value ||
            !inputs[0].validity.valid ||
            !inputs[1].validity.valid
        ) {
            formStatus.textContent =
                'Select an exercise and enter valid sets and reps.';

            row.querySelector(':invalid')?.reportValidity();
            return;
        }

        exercises.push({
            id: select.value,
            exercise_id: select.value,
            sets: Number(inputs[0].value),
            reps: Number(inputs[1].value)
        });
    }

    const payload = {
        name,
        description: routineDesc.value.trim(),
        exercises: exercises.map((exercise, index) => ({
            exercise_id: Number(exercise.exercise_id),
            target_sets: exercise.sets,
            target_reps: exercise.reps,
            exercise_order: index + 1
        }))
    };

    const saveButton = form.querySelector(
        'button[type="submit"]'
    );

    saveButton.disabled = true;
    formStatus.textContent = 'Saving routine...';

    try {
        if (USE_SAMPLE_DATA) {

            // Sample data saving. Set to false when using database instead
            const savedRoutine = {
                id: routineId.value || `sample-${Date.now()}`,
                name,
                description: routineDesc.value.trim(),
                exercises: exercises.map(exercise => ({
                    id: exercise.id,
                    sets: exercise.sets,
                    reps: exercise.reps
                }))
            };

            if (routineId.value) {
                const index = routines.findIndex(
                    item => String(item.id) ===
                            String(routineId.value)
                );

                if (index !== -1) {
                    routines[index] = savedRoutine;
                }
            } else {
                routines.push(savedRoutine);
            }

            renderRoutines();
            closeForm();

            pageStatus.textContent = ' ';

        } else {
            
            await saveRoutineToDatabase(payload);

            await loadRoutinesFromDatabase();

            closeForm();

            pageStatus.textContent = 'Routine saved successfully.';
        }

    } catch (error) {
        formStatus.textContent =
            `Could not save routine: ${error.message}`;

    } finally {
        saveButton.disabled = false;
    }
});


document.querySelectorAll('[data-logout]').forEach(button => {
    button.addEventListener('click', async () => {
        button.disabled = true;

        try {
            await gymApi('/auth/logout', {
                method: 'POST',
                body: '{}'
            });

            location.replace('login.html');

        } catch (error) {
            pageStatus.textContent =
                `Could not log out: ${error.message}`;

            button.disabled = false;
        }
    });
});


async function initializePage() {
    if (USE_SAMPLE_DATA) {
       //Sample data. Set to false when using database instead

        exerciseCatalog = sampleExercises;
        routines = sampleRoutines;

        renderRoutines();

        document.body.dataset.auth = 'ready';
        pageStatus.textContent = '';

        return;
    }

    
    document.body.dataset.auth = 'loading';
    pageStatus.textContent = 'Loading your routines...';

    try {
        await loadExercisesFromDatabase();
        await loadRoutinesFromDatabase();

        document.body.dataset.auth = 'ready';
        pageStatus.textContent = '';

    } catch (error) {
        pageStatus.textContent =
            `Could not load routines: ${error.message}`;

        routinesList.replaceChildren();
        routineCount.textContent = '0 ROUTINES';
    }
}

initializePage();
