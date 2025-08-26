declare module 'firebase/app' {
  export function initializeApp(config: any): any;
}

declare module 'firebase/firestore' {
  export function getFirestore(app: any): any;
  export function collection(db: any, path: string): any;
  export function getDocs(query: any): Promise<any>;
  export function getDoc(docRef: any): Promise<any>;
  export function doc(db: any, path: string, id: string): any;
  export function addDoc(collectionRef: any, data: any): Promise<any>;
  export function updateDoc(docRef: any, data: any): Promise<void>;
  export function deleteDoc(docRef: any): Promise<void>;
  export function query(collectionRef: any, ...constraints: any[]): any;
  export function orderBy(field: string, direction?: string): any;
  export function serverTimestamp(): any;
}
