import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, collection, addDoc, doc, updateDoc, deleteDoc, onSnapshot, query } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// DOM element selectors
const form = document.getElementById('form');
const input = document.getElementById('input');
const todosUL = document.getElementById('todos');
const userIdDisplay = document.getElementById('userIdDisplay');

// Firebase variables (initialized later)
let app;
let db;
let auth;
let currentUserId = 'loading...'; // Initial state for user ID

// Get app-specific global variables from the environment
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
const firebaseConfig = JSON.parse(typeof __firebase_config !== 'undefined' ? __firebase_config : '{}');
const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;

/**
 * Initializes Firebase application and authentication.
 * Sets up the authentication state listener and starts fetching todos.
 */
async function initFirebase() {
  try {
    app = initializeApp(firebaseConfig);
    db = getFirestore(app);
    auth = getAuth(app);

    // Authenticate user: prefer custom token, otherwise sign in anonymously
    if (initialAuthToken) {
      await signInWithCustomToken(auth, initialAuthToken);
    } else {
      await signInAnonymously(auth);
    }

    // Listen for authentication state changes
    onAuthStateChanged(auth, (user) => {
      if (user) {
        currentUserId = user.uid;
        userIdDisplay.innerText = `User ID: ${currentUserId}`;
        // Setup real-time listener for todos only after user is authenticated
        setupRealtimeListener();
      } else {
        currentUserId = crypto.randomUUID(); // Use a random ID for unauthenticated users
        userIdDisplay.innerText = `User ID: ${currentUserId} (anonymous)`;
        // Setup real-time listener for todos even for anonymous users
        setupRealtimeListener();
      }
    });

  } catch (error) {
    console.error("Error initializing Firebase:", error);
    userIdDisplay.innerText = `Authentication Error: ${error.message}`;
  }
}

/**
 * Sets up a real-time listener for todos from Firestore using onSnapshot.
 * This function will update the UI whenever there are changes in the Firestore collection.
 */
function setupRealtimeListener() {
  // Ensure db and currentUserId are available before setting up the listener
  if (!db || currentUserId === 'loading...') {
    console.log('Firebase or user ID not ready yet for real-time listener.');
    return;
  }

  // Define the collection path for the current user's private todos
  // Stored under artifacts/{appId}/users/{userId}/todos
  const todosCollectionRef = collection(db, `artifacts/${appId}/users/${currentUserId}/todos`);

  // Create a query to fetch documents. No orderBy for simplicity and to avoid index issues.
  const q = query(todosCollectionRef);

  // Subscribe to real-time updates
  onSnapshot(q, (snapshot) => {
    todosUL.innerHTML = ''; // Clear existing todos in the UI to re-render
    if (snapshot.empty) {
        console.log("No todos found for this user.");
    }
    snapshot.forEach((doc) => {
      // Create a todo object including its Firestore document ID
      const todo = { id: doc.id, ...doc.data() };
      addTodoToUI(todo); // Add each fetched todo to the UI
    });
  }, (error) => {
    console.error("Error fetching todos in real-time:", error);
    // Optional: Display an error message to the user
  });
}

/**
 * Adds a single todo item to the UI.
 * @param {object} todo - The todo object from Firestore, including its ID, text, and completed status.
 */
function addTodoToUI(todo) {
  const todoEl = document.createElement('li');
  // Store the Firestore document ID on the list item for easy reference during updates/deletes
  todoEl.setAttribute('data-id', todo.id);

  if (todo.completed) {
    todoEl.classList.add('completed');
  }
  todoEl.innerText = todo.text;

  // Event listener for left click to toggle completion status
  todoEl.addEventListener('click', async () => {
    todoEl.classList.toggle('completed'); // Optimistically update UI
    await updateTodoStatusInFirestore(todo.id, todoEl.classList.contains('completed'));
  });

  // Event listener for right click (context menu) to delete todo
  todoEl.addEventListener('contextmenu', async (e) => {
    e.preventDefault(); // Prevent the browser's default context menu
    await deleteTodoFromFirestore(todo.id);
  });

  todosUL.appendChild(todoEl);
}

// Event listener for form submission to add a new todo
form.addEventListener('submit', async (e) => {
  e.preventDefault(); // Prevent default form submission behavior (page reload)
  const todoText = input.value.trim(); // Get and trim the input value

  if (todoText) {
    try {
      // Add a new document to the user's todos collection in Firestore
      await addDoc(collection(db, `artifacts/${appId}/users/${currentUserId}/todos`), {
        text: todoText,
        completed: false, // New todos are not completed by default
        createdAt: new Date() // Add a timestamp for potential future sorting
      });
      input.value = ''; // Clear the input field after successful addition
    } catch (e) {
      console.error("Error adding document to Firestore: ", e);
      // Optional: Provide user feedback about the error
    }
  }
});

/**
 * Updates the 'completed' status of a todo item in Firestore.
 * @param {string} id - The Firestore document ID of the todo to update.
 * @param {boolean} completedStatus - The new completed status.
 */
async function updateTodoStatusInFirestore(id, completedStatus) {
  if (!db || currentUserId === 'loading...') {
      console.log('Database or user ID not ready for update operation.');
      return;
  }
  try {
    // Get a reference to the specific todo document
    const todoRef = doc(db, `artifacts/${appId}/users/${currentUserId}/todos`, id);
    // Update the 'completed' field
    await updateDoc(todoRef, { completed: completedStatus });
  } catch (e) {
    console.error("Error updating document in Firestore: ", e);
    // Optional: Revert UI change or inform user
  }
}

/**
 * Deletes a todo item from Firestore.
 * @param {string} id - The Firestore document ID of the todo to delete.
 */
async function deleteTodoFromFirestore(id) {
  if (!db || currentUserId === 'loading...') {
      console.log('Database or user ID not ready for delete operation.');
      return;
  }
  try {
    // Get a reference to the specific todo document
    await deleteDoc(doc(db, `artifacts/${appId}/users/${currentUserId}/todos`, id));
  } catch (e) {
    console.error("Error deleting document from Firestore: ", e);
    // Optional: Inform user about the error
  }
}

// Initialize Firebase when the window loads
window.onload = initFirebase;
