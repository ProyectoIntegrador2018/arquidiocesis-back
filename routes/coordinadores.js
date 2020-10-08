const bcrypt = require('bcrypt-nodejs');
const moment = require('moment');

const add = async(firestore, req, res)=>{
	var {
		identificador,
		nombre,
		apellido_paterno,
		apellido_materno,
		estado_civil,
		sexo,
		email,
		fecha_nacimiento,
		escolaridad,
		oficio,
		domicilio,
		password
	} = req.body;

	
	if(!req.user.admin){
		return res.send({
			error: true,
			code: 999,
			message: 'No tienes acceso a esta acción'
		})
  	}

	var checkEmail = await firestore.collection('logins').doc(email.toLowerCase()).get();
	if(checkEmail.exists) return res.send({ error: true, code: 1, message: 'Correo ya utilizado.' });

	var fn = moment(fecha_nacimiento, 'YYYY-MM-DD');
	if(!fn.isValid()) fn = moment();

	// Validate if a coordinador with identificador exists
	const coordinador = await firestore.collection('coordinadores').where('identificador', '==', identificador).get();
    
	if (!coordinador.empty) {
		return res.send({
			error: true, 
			message: 'Ya existe un coordinador con el identificador proporcionado.'
		})
	}

	var newCoordinador = {
		identificador,
		nombre,
		apellido_paterno,
		apellido_materno,
		fecha_nacimiento: fn,
		sexo,
		estado_civil,
		email,
		escolaridad,
		oficio,
		domicilio,
  }

	var newLogin = {
		password: bcrypt.hashSync(password),
		tipo: 'coordinador',
		id: null
	}

	try {
		const docref = await firestore.collection('coordinadores').add(newCoordinador)
		newLogin.id = docref.id
		const login = await firestore.collection('logins').doc(email.toLowerCase()).set(newLogin);

		return res.send({
			error: false,
			data: {
				id: docref.id,
				...newCoordinador
			}
		})
	} catch (e) {
		console.log(e);
		return res.send({
			error: true,
			message: 'Error inesperado.'
		})
	}
}

const getall = async (firestore, req, res)=>{
	try{
		const snapshot = await firestore.collection('coordinadores').get();
		var coordinadores = []
		snapshot.forEach(doc => {
			var d = doc.data()
			coordinadores.push({ 
				id: doc.id,
				nombre: d.nombre,
				apellido_paterno: d.apellido_paterno,
				apellido_materno: d.apellido_materno,
				email: d.email
			});
		});
		return res.send({
			error: false,
			data: coordinadores
		})
	}catch(e){
		return res.send({
			error: true,
			message: 'Error inesperado.'
		})
	}
}

const getone = async (firestore, req, res)=>{
	try{
		const snapshot = await firestore.collection('coordinadores').doc(req.params.id).get();
		if(!snapshot.exists) return res.send({
			error: true,
			message: 'Coordinador no existe'
		});
		
		var coordinador = snapshot.data();
		coordinador.id = snapshot.id;
		coordinador.grupos = [];
		coordinador.decanatos = [];
		coordinador.parroquias = [];
		coordinador.capillas = [];
		var parroquias = new Set(), capillas = new Set(), decanatos = new Set();

		var groupSnap = await firestore.collection('grupos').where('coordinador', '==', snapshot.id).get('nombre,parroquia,capilla');
		for(var i of groupSnap.docs){
			if(!i.exists) continue;
			var d = i.data();
			var g = {
				id: i.id,
				nombre: d.nombre,
			}
			if(d.capilla){
				g.capilla = d.capilla;
				capillas.add(d.capilla);
			}else{
				g.parroquia = d.parroquia;
				parroquias.add(d.parroquia)
			}
			coordinador.grupos.push(g)
		}

		capillas = [...capillas];
		var group_capillas = capillas;
		var group_parroquias = [...parroquias];

		if(coordinador.grupos.length>0){
			if(capillas.length>0){
				var capSnap = await firestore.getAll(...capillas.map(a=>firestore.doc('capillas/'+a)));
				capSnap.forEach(a=>{
					if(!a.exists) return;
					var d = a.data();
					if(group_capillas.findIndex(b=>b==a.id)!=-1){
						coordinador.capillas.push({
							id: a.id,
							nombre: d.nombre
						});
					}
					parroquias.add(d.parroquia);
				})
			}

			parroquias = [...parroquias];

			var parrSnap = await firestore.getAll(...parroquias.map(a=>firestore.doc('parroquias/'+a)));
			parrSnap.forEach(a=>{
				if(!a.exists) return;
				var d = a.data()
				if(group_parroquias.findIndex(b=>b==a.id)!=-1){
					coordinador.parroquias.push({
						id: a.id,
						nombre: d.nombre
					})
				}
				decanatos.add(d.decanato);
			});
			decanatos = [...decanatos];

			var decSnap = await firestore.getAll(...decanatos.map(a=>firestore.doc('decanatos/'+a)));

			decSnap.forEach(a=>{
				if(!a.exists) return;
				coordinador.decanatos.push({
					id: a.id,
					...a.data()
				});
			})
		}

		return res.send({
			error: false,
			data: coordinador
		})

	}catch(e){
		return res.send({
			error: true,
			message: 'Mensaje inesperado.'
		})
	}
}

const editCoordinador = async (firestore, req, res) => {
	var id = req.params.id;
	var { 
		apellido_paterno,
		apellido_materno,
		domicilio,
		escolaridad,
		estado_civil,
		fecha_nacimiento,
		nombre,
		oficio,
		sexo
	} = req.body;

	if(!req.user.admin){
		return res.send({
			error: true,
			code: 999,
			message: 'No tienes acceso a esta acción'
		})
  	}

	var fn = moment(fecha_nacimiento, 'YYYY-MM-DD');
	if(!fn.isValid()) fn = moment();

	try {
		var memberSnap = await firestore.collection('coordinadores').doc(id).get();
		if (!memberSnap.exists) return res.send({ error: true, message: 'Coordinador no existe.', code: 1 });
		await firestore.collection('coordinadores').doc(id).update({
			apellido_paterno,
			apellido_materno,
			domicilio,
			escolaridad,
			estado_civil,
			fecha_nacimiento: fn.toDate(),
			nombre,
			oficio,
			sexo
		});
		return res.send({
			error: false,
			data: true
		})
	} catch (err) {
		return res.send({
			error: true,
			message: 'Error inesperado.'
		})
	}
}

const remove = async (firestore, req, res)=>{
	var { id } = req.params;

	if(!req.user.admin){
		return res.send({
			error: true,
			code: 999,
			message: 'No tienes acceso a esta acción'
		})
  	}
	try{
		var coordSnap = await firestore.collection('coordinadores').doc(id).get('nombre');
		if(!coordSnap.exists) return res.send({
			error: true,
			message: 'El coordinador no existe'
		});
		var l = await firestore.collection('logins').where('id', '==', coordSnap.id).where('tipo', '==', 'coordinador').get();
		let batch = firestore.batch();
		l.docs.forEach(a=>{
			batch.delete(a.ref);
		})
		await batch.commit();
		await firestore.collection('coordinadores').doc(id).delete();

		return res.send({
			error: false,
			data: true
		})
	}catch(e){
		return res.send({
			error: true,
			message: 'Mensaje inesperado'
		})
	}
}

module.exports = {
	add,
	getall,
	getone,
	editCoordinador,
	remove
}